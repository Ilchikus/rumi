// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, TextSelection } from "prosemirror-state"
import type { EditorState, Transaction } from "prosemirror-state"
import { Fragment, Node as ProseMirrorNode, Schema, Slice } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import { reportEditorError, uploadEditorAsset } from "../platform"
import {
  RUMI_SLICE_MIME,
  parseRumiClipboardSlice,
  serializeClipboardHtml,
  serializeClipboardText,
  serializeRumiClipboardSlice
} from "../clipboardSerialization"

export const pasteHandlerKey = new PluginKey("pasteHandler")

// URL regex that matches common URL patterns
const URL_REGEX = /^(https?:\/\/[^\s<>\"]+)$/i

function insertBlockAtSelection(view: EditorView, blockNode: ProseMirrorNode) {
  const { state, dispatch } = view
  const { $from } = state.selection
  const isEmptyParagraph =
    $from.parent.type.name === "paragraph" &&
    $from.parent.content.size === 0

  let tr
  if (isEmptyParagraph) {
    tr = state.tr.replaceWith($from.before(), $from.after(), blockNode)
  } else {
    tr = state.tr.insert($from.after(), blockNode)
  }

  dispatch(tr)
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

function insertBlockAtPosition(view: EditorView, blockNode: ProseMirrorNode, pos: number) {
  const { state, dispatch } = view
  const $pos = state.doc.resolve(pos)
  const insertPos = $pos.depth > 0 ? $pos.after($pos.depth) : pos
  const tr = state.tr.insert(insertPos, blockNode)
  dispatch(tr)
}

export function createUrlPasteTransaction(
  state: EditorState,
  text: string,
  schema: Schema = state.schema
): Transaction | null {
  const href = text.trim()
  const link = schema.marks.link

  if (!link || !URL_REGEX.test(href) || state.selection.$from.parent.type === schema.nodes.code_block) {
    return null
  }

  if (state.selection instanceof TextSelection && !state.selection.empty) {
    const transaction = state.tr.addMark(
      state.selection.from,
      state.selection.to,
      link.create({ href })
    )
    return transaction.setSelection(TextSelection.create(transaction.doc, state.selection.to))
  }

  return state.tr.replaceSelectionWith(schema.text(href, [link.create({ href })]), false)
}

export function createCodeTextPasteTransaction(
  state: EditorState,
  text: string,
  schema: Schema = state.schema
): Transaction | null {
  const { selection } = state
  if (
    text.length === 0 ||
    !(selection instanceof TextSelection) ||
    selection.$from.parent.type !== schema.nodes.code_block ||
    selection.$to.parent.type !== schema.nodes.code_block ||
    selection.$from.parent !== selection.$to.parent
  ) {
    return null
  }

  return state.tr.insertText(text, selection.from, selection.to)
}

export function createPlainTextPasteSlice(text: string, schema: Schema): Slice {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/u, "")
  const paragraphs = normalized.split(/\n[\t ]*\n+/u).map((paragraphText) => {
    const inline: ProseMirrorNode[] = []
    const lines = paragraphText.split("\n")
    lines.forEach((line, index) => {
      if (line) inline.push(schema.text(line))
      if (index < lines.length - 1 && schema.nodes.soft_break) {
        inline.push(schema.nodes.soft_break.create())
      }
    })
    return schema.nodes.paragraph.create(null, inline)
  })
  const doc = schema.nodes.doc.create(null, paragraphs)
  return Slice.maxOpen(doc.content, true)
}

function normalizePastedNode(node: ProseMirrorNode, schema: Schema): ProseMirrorNode {
  if (node.type === schema.nodes.table && schema.nodes.table_header) {
    const rows: ProseMirrorNode[] = []
    node.forEach((row, _offset, rowIndex) => {
      if (rowIndex !== 0) {
        rows.push(normalizePastedNode(row, schema))
        return
      }

      const cells: ProseMirrorNode[] = []
      row.forEach((cell) => {
        cells.push(
          cell.type === schema.nodes.table_header
            ? cell
            : schema.nodes.table_header.create(cell.attrs, cell.content)
        )
      })
      rows.push(row.copy(Fragment.fromArray(cells)))
    })
    return node.copy(Fragment.fromArray(rows))
  }

  if (node.isLeaf) return node
  const children: ProseMirrorNode[] = []
  node.forEach((child) => children.push(normalizePastedNode(child, schema)))
  return node.copy(Fragment.fromArray(children))
}

export function normalizePastedTables(slice: Slice, schema: Schema): Slice {
  const children: ProseMirrorNode[] = []
  slice.content.forEach((node) => children.push(normalizePastedNode(node, schema)))
  return new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd)
}

function writePortableClipboard(
  view: EditorView,
  event: ClipboardEvent,
  cut: boolean
): boolean {
  const clipboard = event.clipboardData
  const { selection } = view.state
  if (!clipboard || selection.empty) return false

  const slice = selection.content()
  clipboard.clearData()
  clipboard.setData("text/html", serializeClipboardHtml(slice))
  clipboard.setData("text/plain", serializeClipboardText(slice))
  try {
    clipboard.setData(RUMI_SLICE_MIME, serializeRumiClipboardSlice(slice))
  } catch {
    // Some browser clipboard implementations reject custom MIME types. The
    // portable HTML and plain-text flavors are still complete fallbacks.
  }
  event.preventDefault()

  if (cut) {
    view.dispatch(
      view.state.tr
        .deleteSelection()
        .setMeta("uiEvent", "cut")
        .scrollIntoView()
    )
  }

  return true
}

export function pasteHandlerPlugin(schema: Schema) {
  let pasteWasExplicitlyPlainText = false

  return new Plugin({
    key: pasteHandlerKey,
    props: {
      clipboardTextParser(text, _context, plain) {
        pasteWasExplicitlyPlainText = plain
        return createPlainTextPasteSlice(text, schema)
      },

      transformPasted(slice, _view, plain) {
        if (!plain) pasteWasExplicitlyPlainText = false
        return plain ? slice : normalizePastedTables(slice, schema)
      },

      handlePaste(view, event, slice) {
        const clipboard = event.clipboardData
        if (!clipboard) return false
        const plainTextPaste = pasteWasExplicitlyPlainText
        pasteWasExplicitlyPlainText = false

        // Handle image files from clipboard
        const imageFile = Array.from(clipboard.files).find((file) =>
          file.type.startsWith("image/")
        )

        if (imageFile && schema.nodes.image) {
          void uploadEditorAsset(imageFile)
            .then((relativePath) => {
              if (!relativePath) return
              const image = schema.nodes.image.create({ src: relativePath })
              insertBlockAtSelection(view, image)
            })
            .catch(reportEditorError)
          return true
        }

        const pdfFile = Array.from(clipboard.files).find((file) => isPdfFile(file))

        if (pdfFile && schema.nodes.file_embed) {
          void uploadEditorAsset(pdfFile)
            .then((relativePath) => {
              if (!relativePath) return
              const fileEmbed = schema.nodes.file_embed.create({ src: relativePath })
              insertBlockAtSelection(view, fileEmbed)
            })
            .catch(reportEditorError)
          return true
        }

        const html = clipboard.getData("text/html")
        const text = clipboard.getData("text/plain")
        const codeText = text.length > 0
          ? text
          : html
            ? slice.content.textBetween(0, slice.content.size, "\n", "\n")
            : text

        // Code is literal text. Handle it before URL detection, rich HTML, or
        // Markdown parsing so ProseMirror never has to fit block nodes into the
        // code_block's text-only content expression.
        const codeTransaction = createCodeTextPasteTransaction(
          view.state,
          codeText,
          schema
        )
        if (codeTransaction) {
          event.preventDefault()
          view.dispatch(codeTransaction.scrollIntoView())
          return true
        }

        if (!plainTextPaste) {
          const exactSlice = parseRumiClipboardSlice(
            clipboard.getData(RUMI_SLICE_MIME),
            schema
          )
          if (exactSlice) {
            event.preventDefault()
            view.dispatch(
              view.state.tr
                .replaceSelection(exactSlice)
                .setMeta("uiEvent", "paste")
                .scrollIntoView()
            )
            return true
          }
        }

        // A URL is always pasted as a normal inline link. Handle this before
        // rich HTML so a browser-provided anchor cannot replace selected text.
        const urlTransaction = createUrlPasteTransaction(view.state, text, schema)
        if (urlTransaction) {
          event.preventDefault()
          view.dispatch(urlTransaction.scrollIntoView())
          return true
        }
        // ProseMirror has already chosen the modifier-aware clipboard flavor:
        // rich HTML for a normal paste, or our LF-preserving parser for plain
        // text. Returning false inserts that parsed slice without flattening it
        // through an HTML-to-Markdown conversion.
        return false
      },

      handleDOMEvents: {
        copy(view, event) {
          return writePortableClipboard(view, event, false)
        },
        cut(view, event) {
          return writePortableClipboard(view, event, true)
        }
      },

      handleDrop(view, event, slice, moved) {
        // Only handle external drops (files from desktop)
        if (moved) return false

        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false

        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (!pos) return false

        const imageFile = Array.from(files).find((file) =>
          file.type.startsWith("image/")
        )

        const pdfFile = Array.from(files).find((file) => isPdfFile(file))

        if (imageFile && schema.nodes.image) {
          event.preventDefault()
          void uploadEditorAsset(imageFile)
            .then((relativePath) => {
              if (!relativePath) return
              const image = schema.nodes.image.create({ src: relativePath })
              insertBlockAtPosition(view, image, pos.pos)
            })
            .catch(reportEditorError)
          return true
        }

        if (pdfFile && schema.nodes.file_embed) {
          event.preventDefault()
          void uploadEditorAsset(pdfFile)
            .then((relativePath) => {
              if (!relativePath) return
              const fileEmbed = schema.nodes.file_embed.create({ src: relativePath })
              insertBlockAtPosition(view, fileEmbed, pos.pos)
            })
            .catch(reportEditorError)
          return true
        }

        return false
      },
    },
  })
}

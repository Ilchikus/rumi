// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection } from "prosemirror-state"
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
import {
  createDeleteSelectedBlocksTransaction,
  multiBlockSelectionKey
} from "./multiBlockSelection"
import {
  normalizeExternalClipboardHtml,
  normalizeExternalRichSlice,
  normalizePastedTables
} from "../richClipboardNormalization"
import { isLinkDestination, normalizeLinkHref } from "../linkHref"

export { normalizePastedTables } from "../richClipboardNormalization"

export const pasteHandlerKey = new PluginKey("pasteHandler")

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
  const hasSelectedText = state.selection instanceof TextSelection && !state.selection.empty
  const isExternalUrl = /^(?:https?:\/\/|www\.)[^\s<>"]+$/iu.test(href)

  if (
    !link ||
    (!isExternalUrl && !(hasSelectedText && isLinkDestination(href))) ||
    state.selection.$from.parent.type.spec.code
  ) {
    return null
  }

  const normalizedHref = normalizeLinkHref(href)

  if (hasSelectedText) {
    const transaction = state.tr.addMark(
      state.selection.from,
      state.selection.to,
      link.create({ href: normalizedHref })
    )
    return transaction.setSelection(TextSelection.create(transaction.doc, state.selection.to))
  }

  return state.tr.replaceSelectionWith(
    schema.text(href, [link.create({ href: normalizedHref })]),
    false
  )
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
    !selection.$from.parent.type.spec.code ||
    !selection.$to.parent.type.spec.code ||
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

function explicitBlockPositions(state: EditorState): number[] {
  const selectedBlocks = multiBlockSelectionKey.getState(state)?.selectedBlocks ?? []
  return [...new Set(selectedBlocks)]
    .filter((pos) => state.doc.nodeAt(pos) !== null)
    .sort((left, right) => left - right)
}

function textSelectionNear(doc: ProseMirrorNode, pos: number): TextSelection | null {
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  for (const direction of [-1, 1] as const) {
    const selection = Selection.findFrom(resolved, direction, true)
    if (selection instanceof TextSelection) return selection
  }
  return null
}

function finishPasteTransaction(
  transaction: Transaction,
  preferredSelectionPos = transaction.selection.to
): Transaction {
  if (!(transaction.selection instanceof TextSelection)) {
    const selection = textSelectionNear(transaction.doc, preferredSelectionPos)
    if (selection) transaction.setSelection(selection)
  }
  transaction.setMeta(multiBlockSelectionKey, {
    selectedBlocks: [],
    anchorBlock: null
  })
  transaction.setMeta("uiEvent", "paste")
  return transaction.scrollIntoView()
}

export function createSelectedBlocksPasteTransaction(
  state: EditorState,
  slice: Slice
): Transaction | null {
  const positions = explicitBlockPositions(state)
  if (positions.length === 0 || slice.content.size === 0) return null

  const firstPos = positions[0]!
  let transaction = state.tr

  for (const pos of positions.slice(1).reverse()) {
    const mappedPos = transaction.mapping.map(pos)
    const node = transaction.doc.nodeAt(mappedPos)
    if (node) transaction.delete(mappedPos, mappedPos + node.nodeSize)
  }

  const mappedFirstPos = transaction.mapping.map(firstPos)
  const firstNode = transaction.doc.nodeAt(mappedFirstPos)
  if (!firstNode) return null

  const closedSlice = new Slice(slice.content, 0, 0)
  transaction.replace(
    mappedFirstPos,
    mappedFirstPos + firstNode.nodeSize,
    closedSlice
  )
  return finishPasteTransaction(
    transaction,
    mappedFirstPos + closedSlice.content.size
  )
}

function explicitBlockClipboardSlice(state: EditorState): Slice | null {
  const selectedBlocks =
    multiBlockSelectionKey.getState(state)?.selectedBlocks ?? []
  if (selectedBlocks.length === 0) return null

  const nodes = [...new Set(selectedBlocks)]
    .sort((left, right) => left - right)
    .map((pos) => state.doc.nodeAt(pos))
    .filter((node): node is ProseMirrorNode => Boolean(node))
  return nodes.length > 0
    ? new Slice(Fragment.fromArray(nodes), 0, 0)
    : null
}

function writePortableClipboard(
  view: EditorView,
  event: ClipboardEvent,
  cut: boolean
): boolean {
  const clipboard = event.clipboardData
  const { selection } = view.state
  const blockSlice = explicitBlockClipboardSlice(view.state)
  if (!clipboard || (selection.empty && !blockSlice)) return false

  const slice = blockSlice ?? selection.content()
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
    const transaction = blockSlice
      ? createDeleteSelectedBlocksTransaction(view.state)
      : view.state.tr.deleteSelection().scrollIntoView()
    if (transaction) {
      transaction.setMeta("uiEvent", "cut")
      view.dispatch(transaction)
    }
  }

  return true
}

export function pasteHandlerPlugin(schema: Schema) {
  let pasteWasExplicitlyPlainText = false

  return new Plugin({
    key: pasteHandlerKey,
    props: {
      transformPastedHTML(html) {
        return normalizeExternalClipboardHtml(html)
      },

      clipboardTextParser(text, _context, plain) {
        pasteWasExplicitlyPlainText = plain
        return createPlainTextPasteSlice(text, schema)
      },

      transformPasted(slice, _view, plain) {
        if (!plain) pasteWasExplicitlyPlainText = false
        return plain ? slice : normalizeExternalRichSlice(slice, schema)
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
          view.dispatch(finishPasteTransaction(codeTransaction))
          return true
        }

        let exactSlice: Slice | null = null
        if (!plainTextPaste) {
          exactSlice = parseRumiClipboardSlice(
            clipboard.getData(RUMI_SLICE_MIME),
            schema
          )
          if (exactSlice) {
            event.preventDefault()
            view.dispatch(
              createSelectedBlocksPasteTransaction(view.state, exactSlice) ??
              finishPasteTransaction(view.state.tr.replaceSelection(exactSlice))
            )
            return true
          }
        }

        const selectedBlocksTransaction = createSelectedBlocksPasteTransaction(
          view.state,
          slice
        )
        if (selectedBlocksTransaction) {
          event.preventDefault()
          view.dispatch(selectedBlocksTransaction)
          return true
        }

        // A URL is always pasted as a normal inline link. Handle this before
        // rich HTML so a browser-provided anchor cannot replace selected text.
        const urlTransaction = createUrlPasteTransaction(view.state, text, schema)
        if (urlTransaction) {
          event.preventDefault()
          view.dispatch(finishPasteTransaction(urlTransaction))
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

    appendTransaction(transactions, _oldState, newState) {
      const pasted = transactions.some((transaction) => {
        return transaction.getMeta("uiEvent") === "paste" || transaction.getMeta("paste") === true
      })
      if (!pasted) return null

      const selectedBlocks =
        multiBlockSelectionKey.getState(newState)?.selectedBlocks ?? []
      const nodeSelected = newState.selection instanceof NodeSelection
      if (selectedBlocks.length === 0 && !nodeSelected) return null

      const transaction = newState.tr.setMeta(multiBlockSelectionKey, {
        selectedBlocks: [],
        anchorBlock: null
      })
      if (nodeSelected) {
        const selection = textSelectionNear(newState.doc, newState.selection.to)
        if (selection) transaction.setSelection(selection)
      }
      return transaction
    }
  })
}

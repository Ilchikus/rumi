// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey } from "prosemirror-state"
import { Node as ProseMirrorNode, Schema, Slice } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import TurndownService from "turndown"
import { parseMarkdown } from "../markdown"
import { reportEditorError, uploadEditorAsset } from "../platform"

export const pasteHandlerKey = new PluginKey("pasteHandler")

// URL regex that matches common URL patterns
const URL_REGEX = /^(https?:\/\/[^\s<>\"]+)$/i

// More permissive URL regex for inline detection
const INLINE_URL_REGEX = /https?:\/\/[^\s<>\"]+/gi

// Initialize Turndown with sensible defaults
function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  })

  // Keep common semantic elements
  turndown.addRule("strikethrough", {
    filter: ["del", "s", "strike"],
    replacement: (content) => `~~${content}~~`,
  })

  turndown.addRule("underline", {
    filter: ["u", "ins"],
    replacement: (content) => `__${content}__`,
  })

  turndown.addRule("mark", {
    filter: "mark",
    replacement: (content) => `==${content}==`,
  })

  // Handle tables better
  turndown.addRule("tableCell", {
    filter: ["th", "td"],
    replacement: (content, node) => {
      return ` ${content.trim().replace(/\n/g, " ")} |`
    },
  })

  turndown.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      return `|${content}\n`
    },
  })

  turndown.addRule("table", {
    filter: "table",
    replacement: (content, node) => {
      const rows = content.trim().split("\n").filter(Boolean)
      if (rows.length === 0) return ""

      // Add separator after header row
      const headerRow = rows[0]
      const colCount = (headerRow.match(/\|/g) || []).length - 1
      const separator = "|" + " --- |".repeat(colCount)

      return rows[0] + "\n" + separator + "\n" + rows.slice(1).join("\n") + "\n\n"
    },
  })

  return turndown
}

const turndownService = createTurndownService()

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

export function pasteHandlerPlugin(schema: Schema) {
  return new Plugin({
    key: pasteHandlerKey,
    props: {
      handlePaste(view, event, slice) {
        const clipboard = event.clipboardData
        if (!clipboard) return false

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

        // If we have HTML content (from web/docs), convert it
        if (html && html.trim()) {
          // Convert HTML to Markdown
          const markdown = turndownService.turndown(html)

          // Parse markdown to ProseMirror document
          const doc = parseMarkdown(markdown, schema)

          // Extract content from doc (skip doc wrapper)
          const content = doc.content

          if (content.childCount > 0) {
            const tr = view.state.tr
            tr.replaceSelection(new Slice(content, 0, 0))
            view.dispatch(tr)
            return true
          }
        }

        // Handle plain text / markdown
        if (text && text.trim()) {
          // Check if it's a single URL on its own line (bookmark case)
          const trimmedText = text.trim()
          if (URL_REGEX.test(trimmedText)) {
            // Check if we're at the start of an empty block or selection spans whole line
            const { $from, $to } = view.state.selection
            const isEmptyParagraph = $from.parent.type.name === "paragraph" &&
                                     $from.parent.content.size === 0
            const isAtBlockStart = $from.parentOffset === 0 && $to.parentOffset === 0

            // If pasting URL into empty paragraph, make it a bookmark
            if (isEmptyParagraph || (isAtBlockStart && $from.pos === $to.pos)) {
              if (schema.nodes.bookmark) {
                const bookmark = schema.nodes.bookmark.create({ url: trimmedText })
                const tr = view.state.tr

                if (isEmptyParagraph) {
                  // Replace the empty paragraph with bookmark
                  tr.replaceWith($from.before(), $from.after(), bookmark)
                } else {
                  tr.replaceSelectionWith(bookmark)
                }

                view.dispatch(tr)
                return true
              }
            }

            // Otherwise insert as a link
            const linkMark = schema.marks.link?.create({ href: trimmedText })
            if (linkMark) {
              const linkText = schema.text(trimmedText, [linkMark])
              const tr = view.state.tr.replaceSelectionWith(linkText, false)
              view.dispatch(tr)
              return true
            }
          }

          // Check if text contains URLs that should be auto-linked
          if (INLINE_URL_REGEX.test(text)) {
            // Parse as markdown which will handle link syntax
            // But first, let's auto-link bare URLs in the text
            const linkedText = autoLinkUrls(text)
            const doc = parseMarkdown(linkedText, schema)
            const content = doc.content

            if (content.childCount > 0) {
              const tr = view.state.tr
              tr.replaceSelection(new Slice(content, 0, 0))
              view.dispatch(tr)
              return true
            }
          }

          // Parse as markdown
          const doc = parseMarkdown(text, schema)
          const content = doc.content

          if (content.childCount > 0) {
            const tr = view.state.tr
            tr.replaceSelection(new Slice(content, 0, 0))
            view.dispatch(tr)
            return true
          }
        }

        return false
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

// Convert bare URLs to markdown links
function autoLinkUrls(text: string): string {
  // Don't process if it's already a markdown link
  if (/\[.*?\]\(.*?\)/.test(text)) {
    return text
  }

  // Replace bare URLs with markdown links
  return text.replace(INLINE_URL_REGEX, (url) => {
    // Check if URL is already inside a markdown link syntax
    return `[${url}](${url})`
  })
}

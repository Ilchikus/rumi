// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"
import { Node as PmNode } from "prosemirror-model"
import hljs from "highlight.js/lib/core"

const codeHighlightKey = new PluginKey("codeHighlight")

interface HljsToken {
  text: string
  cls: string | null
}

// Module-level cache: "lang:text" → parsed tokens.
// Avoids re-running hljs.highlight() when the same code block content hasn't changed,
// which is the common case (typing outside a code block still triggers docChanged).
const tokenCache = new Map<string, HljsToken[]>()

function getDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return false
    const lang = node.attrs.language
    if (!lang || !hljs.getLanguage(lang)) return false

    const text = node.textContent
    if (!text) return false

    const cacheKey = `${lang}:${text}`
    let tokens = tokenCache.get(cacheKey)

    if (!tokens) {
      try {
        const result = hljs.highlight(text, { language: lang })
        tokens = parseHljsResult(result.value)
        tokenCache.set(cacheKey, tokens)
      } catch {
        return false
      }
    }

    let offset = pos + 1 // +1 to get inside the node
    for (const token of tokens) {
      if (token.cls) {
        decorations.push(
          Decoration.inline(offset, offset + token.text.length, {
            class: token.cls
          })
        )
      }
      offset += token.text.length
    }

    return false
  })

  return DecorationSet.create(doc, decorations)
}

function parseHljsResult(html: string): HljsToken[] {
  const tokens: HljsToken[] = []
  let i = 0

  while (i < html.length) {
    if (html[i] === "<") {
      const closeIdx = html.indexOf(">", i)
      if (closeIdx === -1) break

      const tag = html.slice(i, closeIdx + 1)

      if (tag.startsWith("</")) {
        // Closing tag - skip
        i = closeIdx + 1
        continue
      }

      // Extract class from opening tag
      const classMatch = tag.match(/class="([^"]*)"/)
      const cls = classMatch ? classMatch[1] : null

      i = closeIdx + 1

      // Find the text content until the closing tag
      const endTag = html.indexOf("</span>", i)
      if (endTag === -1) break

      const content = html.slice(i, endTag)
      // Content might contain nested spans, so we recursively parse
      const nested = parseHljsResult(content)
      for (const t of nested) {
        tokens.push({ text: t.text, cls: t.cls || cls })
      }
      i = endTag + 7 // "</span>".length
    } else {
      // Plain text - collect until next tag or end
      let end = html.indexOf("<", i)
      if (end === -1) end = html.length
      const text = html.slice(i, end).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      if (text) {
        tokens.push({ text, cls: null })
      }
      i = end
    }
  }

  return tokens
}

export function codeHighlightPlugin() {
  return new Plugin({
    key: codeHighlightKey,
    state: {
      init(_, { doc }) {
        return getDecorations(doc)
      },
      apply(tr, decorations) {
        if (tr.docChanged) {
          return getDecorations(tr.doc)
        }
        return decorations
      }
    },
    props: {
      decorations(state) {
        return codeHighlightKey.getState(state)
      }
    }
  })
}

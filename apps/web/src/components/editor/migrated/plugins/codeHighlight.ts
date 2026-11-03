// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"
import { Node as PmNode } from "prosemirror-model"
import { hljs } from "./codeLanguages"

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
    if (node.type.name !== "code_block") return
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
        if (tokenCache.size >= 200) tokenCache.delete(tokenCache.keys().next().value!)
        tokenCache.set(cacheKey, tokens)
      } catch {
        return false
      }
    }

    let offset = pos + 1 // +1 to get inside the node
    for (const token of tokens) {
      if (token.cls && token.text.length) {
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

export function parseHljsResult(html: string): HljsToken[] {
  // Parse the actual tree: highlight.js nests scopes (HTML tags, PHP, templates).
  // TextContent decodes every entity once and preserves UTF-16 editor offsets.
  const template = document.createElement("template")
  template.innerHTML = html
  const tokens: HljsToken[] = []
  const visit = (node: Node, classes: string[]) => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? ""
      if (text) tokens.push({ text, cls: classes.join(" ") || null })
    } else {
      const nested = node instanceof Element && node.className
        ? node.className.split(/\s+/) : classes
      node.childNodes.forEach((child) => visit(child, nested))
    }
  }
  visit(template.content, [])
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

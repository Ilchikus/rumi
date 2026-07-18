// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Node as PmNode } from "prosemirror-model"
import { EditorView, NodeView } from "prosemirror-view"
import hljs from "highlight.js/lib/core"

// Register commonly used languages
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import python from "highlight.js/lib/languages/python"
import css from "highlight.js/lib/languages/css"
import html from "highlight.js/lib/languages/xml"
import json from "highlight.js/lib/languages/json"
import bash from "highlight.js/lib/languages/bash"
import markdown from "highlight.js/lib/languages/markdown"
import sql from "highlight.js/lib/languages/sql"
import go from "highlight.js/lib/languages/go"
import rust from "highlight.js/lib/languages/rust"
import java from "highlight.js/lib/languages/java"
import cpp from "highlight.js/lib/languages/cpp"
import ruby from "highlight.js/lib/languages/ruby"
import yaml from "highlight.js/lib/languages/yaml"
import xml from "highlight.js/lib/languages/xml"

hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("js", javascript)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("ts", typescript)
hljs.registerLanguage("python", python)
hljs.registerLanguage("py", python)
hljs.registerLanguage("css", css)
hljs.registerLanguage("html", html)
hljs.registerLanguage("json", json)
hljs.registerLanguage("bash", bash)
hljs.registerLanguage("sh", bash)
hljs.registerLanguage("shell", bash)
hljs.registerLanguage("markdown", markdown)
hljs.registerLanguage("md", markdown)
hljs.registerLanguage("sql", sql)
hljs.registerLanguage("go", go)
hljs.registerLanguage("rust", rust)
hljs.registerLanguage("rs", rust)
hljs.registerLanguage("java", java)
hljs.registerLanguage("cpp", cpp)
hljs.registerLanguage("c", cpp)
hljs.registerLanguage("ruby", ruby)
hljs.registerLanguage("rb", ruby)
hljs.registerLanguage("yaml", yaml)
hljs.registerLanguage("yml", yaml)
hljs.registerLanguage("xml", xml)

const LANGUAGES = [
  "", "javascript", "typescript", "python", "css", "html", "json",
  "bash", "markdown", "sql", "go", "rust", "java", "cpp", "ruby", "yaml", "xml"
]

class CodeBlockView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private toolbar: HTMLElement
  private select: HTMLSelectElement
  private copyBtn: HTMLElement

  constructor(private node: PmNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom = document.createElement("pre")
    this.dom.classList.add("code-block-wrapper")

    // Toolbar
    this.toolbar = document.createElement("div")
    this.toolbar.className = "code-block-toolbar"
    this.toolbar.contentEditable = "false"

    // Language selector
    this.select = document.createElement("select")
    this.select.className = "code-block-lang-select"
    LANGUAGES.forEach(lang => {
      const opt = document.createElement("option")
      opt.value = lang
      opt.textContent = lang || "plain text"
      this.select.appendChild(opt)
    })
    this.select.value = node.attrs.language || ""
    this.select.addEventListener("change", () => {
      const pos = this.getPos()
      if (pos === undefined) return
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        language: this.select.value || null
      })
      this.view.dispatch(tr)
    })

    // Copy button
    this.copyBtn = document.createElement("button")
    this.copyBtn.className = "code-block-copy-btn"
    this.copyBtn.textContent = "Copy"
    this.copyBtn.type = "button"
    this.copyBtn.addEventListener("click", (e) => {
      e.preventDefault()
      navigator.clipboard.writeText(this.node.textContent)
      this.copyBtn.textContent = "Copied!"
      setTimeout(() => { this.copyBtn.textContent = "Copy" }, 1500)
    })

    this.toolbar.appendChild(this.select)
    this.toolbar.appendChild(this.copyBtn)
    this.dom.appendChild(this.toolbar)

    // Content
    const code = document.createElement("code")
    if (node.attrs.language) {
      code.className = `language-${node.attrs.language}`
    }
    this.contentDOM = code
    this.dom.appendChild(code)
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.select.value = node.attrs.language || ""
    if (node.attrs.language) {
      this.contentDOM.className = `language-${node.attrs.language}`
    } else {
      this.contentDOM.className = ""
    }
    return true
  }

  stopEvent(event: Event): boolean {
    // Let the select and button handle their own events
    const target = event.target as HTMLElement
    if (this.toolbar.contains(target)) return true
    return false
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    if (this.toolbar.contains(mutation.target)) return true
    return false
  }
}

export function codeBlockNodeView(node: PmNode, view: EditorView, getPos: () => number | undefined): NodeView {
  return new CodeBlockView(node, view, getPos)
}

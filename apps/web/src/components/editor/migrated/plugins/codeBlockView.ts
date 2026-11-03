// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Node as PmNode } from "prosemirror-model"
import { EditorView, NodeView } from "prosemirror-view"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { CodeLanguagePicker } from "./CodeLanguagePicker"

class CodeBlockView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private toolbar: HTMLElement
  private languagePicker: HTMLElement
  private languagePickerRoot: Root
  private copyBtn: HTMLElement

  constructor(private node: PmNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom = document.createElement("pre")
    this.dom.classList.add("code-block-wrapper", "bg-surface-subtle")

    // Toolbar
    this.toolbar = document.createElement("div")
    this.toolbar.className = "code-block-toolbar"
    this.toolbar.contentEditable = "false"

    // Searchable shadcn language picker
    this.languagePicker = document.createElement("div")
    this.languagePicker.className = "code-block-language-picker"
    this.languagePickerRoot = createRoot(this.languagePicker)
    this.renderLanguagePicker()

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

    this.toolbar.appendChild(this.languagePicker)
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

  private renderLanguagePicker() {
    this.languagePickerRoot.render(createElement(CodeLanguagePicker, {
      value: this.node.attrs.language || "",
      onChange: (language: string) => {
        const pos = this.getPos()
        if (pos === undefined) return
        const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          language: language || null
        })
        this.view.dispatch(tr)
      }
    }))
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.renderLanguagePicker()
    if (node.attrs.language) {
      this.contentDOM.className = `language-${node.attrs.language}`
    } else {
      this.contentDOM.className = ""
    }
    return true
  }

  stopEvent(event: Event): boolean {
    // Let the language picker and copy button handle their own events
    const target = event.target as HTMLElement
    if (this.toolbar.contains(target)) return true
    return false
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    if (this.toolbar.contains(mutation.target)) return true
    return false
  }

  destroy() {
    const root = this.languagePickerRoot
    setTimeout(() => root.unmount(), 0)
  }
}

export function codeBlockNodeView(node: PmNode, view: EditorView, getPos: () => number | undefined): NodeView {
  return new CodeBlockView(node, view, getPos)
}

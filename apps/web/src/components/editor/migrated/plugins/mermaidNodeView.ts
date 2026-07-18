// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Node as PmNode } from "prosemirror-model"
import { EditorView, NodeView } from "prosemirror-view"
import mermaid from "mermaid"

// Initialize mermaid with default config
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
})

const VIEW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"></path></svg>`
const EDIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"></path></svg>`
const SPLIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V200H136V56ZM40,56h80V200H40Z"></path></svg>`

type MermaidMode = "view" | "edit" | "split"

let mermaidIdCounter = 0

class MermaidNodeView implements NodeView {
  dom: HTMLElement
  private node: PmNode
  private view: EditorView
  private getPos: () => number | undefined
  private mode: MermaidMode
  private previewContainer: HTMLElement
  private editorContainer: HTMLElement
  private textarea: HTMLTextAreaElement
  private toolbar: HTMLElement
  private errorEl: HTMLElement
  private mermaidId: string

  constructor(node: PmNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node
    this.view = view
    this.getPos = getPos
    this.mode = (node.attrs.mode as MermaidMode) || "split"
    this.mermaidId = `mermaid-${++mermaidIdCounter}`

    // Main container
    this.dom = document.createElement("div")
    this.dom.className = "mermaid-block-wrapper"

    // Toolbar
    this.toolbar = this.createToolbar()
    this.dom.appendChild(this.toolbar)

    // Content wrapper
    const content = document.createElement("div")
    content.className = "mermaid-content"
    this.dom.appendChild(content)

    // Editor container (left side in split, full in edit mode)
    this.editorContainer = document.createElement("div")
    this.editorContainer.className = "mermaid-editor"

    this.textarea = document.createElement("textarea")
    this.textarea.className = "mermaid-textarea"
    this.textarea.value = node.attrs.code || ""
    this.textarea.placeholder = "Enter Mermaid diagram code..."
    this.textarea.spellcheck = false
    this.textarea.addEventListener("input", this.onCodeChange)
    this.textarea.addEventListener("keydown", this.onKeyDown)
    this.editorContainer.appendChild(this.textarea)

    // Preview container (right side in split, full in view mode)
    this.previewContainer = document.createElement("div")
    this.previewContainer.className = "mermaid-preview"

    // Error display
    this.errorEl = document.createElement("div")
    this.errorEl.className = "mermaid-error"
    this.errorEl.style.display = "none"
    this.previewContainer.appendChild(this.errorEl)

    content.appendChild(this.editorContainer)
    content.appendChild(this.previewContainer)

    this.updateMode()
    this.renderDiagram()
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement("div")
    toolbar.className = "mermaid-toolbar"
    toolbar.contentEditable = "false"

    const label = document.createElement("span")
    label.className = "mermaid-label"
    label.textContent = "Mermaid"
    toolbar.appendChild(label)

    const buttons = document.createElement("div")
    buttons.className = "mermaid-mode-buttons"

    const modes: { mode: MermaidMode; icon: string; title: string }[] = [
      { mode: "view", icon: VIEW_SVG, title: "View only" },
      { mode: "edit", icon: EDIT_SVG, title: "Edit only" },
      { mode: "split", icon: SPLIT_SVG, title: "Split view" }
    ]

    modes.forEach(({ mode, icon, title }) => {
      const btn = document.createElement("button")
      btn.className = "mermaid-mode-btn"
      btn.type = "button"
      btn.title = title
      btn.innerHTML = icon
      btn.dataset.mode = mode
      if (this.mode === mode) btn.classList.add("active")
      btn.addEventListener("click", () => this.setMode(mode))
      buttons.appendChild(btn)
    })

    toolbar.appendChild(buttons)
    return toolbar
  }

  private setMode(mode: MermaidMode) {
    this.mode = mode
    const pos = this.getPos()
    if (pos !== undefined) {
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        mode
      })
      this.view.dispatch(tr)
    }
    this.updateMode()
  }

  private updateMode() {
    // Update button states
    this.toolbar.querySelectorAll(".mermaid-mode-btn").forEach((btn) => {
      btn.classList.toggle("active", (btn as HTMLElement).dataset.mode === this.mode)
    })

    // Update visibility
    const isView = this.mode === "view"
    const isEdit = this.mode === "edit"
    const isSplit = this.mode === "split"

    this.editorContainer.style.display = isView ? "none" : "flex"
    this.previewContainer.style.display = isEdit ? "none" : "flex"

    // Set widths for split mode
    if (isSplit) {
      this.editorContainer.style.width = "50%"
      this.previewContainer.style.width = "50%"
    } else {
      this.editorContainer.style.width = "100%"
      this.previewContainer.style.width = "100%"
    }
  }

  private onCodeChange = () => {
    const code = this.textarea.value
    const pos = this.getPos()
    if (pos !== undefined) {
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        code
      })
      this.view.dispatch(tr)
    }
    this.node = this.view.state.doc.nodeAt(pos!) || this.node
    this.renderDiagram()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Prevent ProseMirror from handling certain keys
    if (e.key === "Tab") {
      e.preventDefault()
      const start = this.textarea.selectionStart
      const end = this.textarea.selectionEnd
      const value = this.textarea.value
      this.textarea.value = value.substring(0, start) + "  " + value.substring(end)
      this.textarea.selectionStart = this.textarea.selectionEnd = start + 2
      this.onCodeChange()
    }
    e.stopPropagation()
  }

  private async renderDiagram() {
    const code = this.node.attrs.code
    if (!code) {
      this.previewContainer.innerHTML = ""
      this.errorEl.style.display = "none"
      this.previewContainer.appendChild(this.errorEl)
      const placeholder = document.createElement("div")
      placeholder.className = "mermaid-placeholder"
      placeholder.textContent = "Enter diagram code to see preview"
      this.previewContainer.appendChild(placeholder)
      return
    }

    try {
      // Clear previous content
      this.previewContainer.innerHTML = ""
      this.previewContainer.appendChild(this.errorEl)
      this.errorEl.style.display = "none"

      // Create a container for the diagram
      const diagramContainer = document.createElement("div")
      diagramContainer.className = "mermaid-diagram"
      this.previewContainer.appendChild(diagramContainer)

      // Render the diagram
      const { svg } = await mermaid.render(this.mermaidId, code)
      diagramContainer.innerHTML = svg
    } catch (error) {
      this.errorEl.textContent = `Error: ${error instanceof Error ? error.message : "Invalid diagram"}`
      this.errorEl.style.display = "block"
    }
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false

    const modeChanged = node.attrs.mode !== this.node.attrs.mode
    const codeChanged = node.attrs.code !== this.node.attrs.code

    this.node = node

    if (modeChanged) {
      this.mode = node.attrs.mode || "split"
      this.updateMode()
    }

    if (codeChanged) {
      if (this.textarea.value !== node.attrs.code) {
        this.textarea.value = node.attrs.code || ""
      }
      this.renderDiagram()
    }

    return true
  }

  stopEvent(event: Event): boolean {
    // Let the textarea and buttons handle their own events
    const target = event.target as HTMLElement
    if (this.toolbar.contains(target) || this.textarea.contains(target)) {
      return true
    }
    return false
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    if (this.toolbar.contains(mutation.target) ||
        this.previewContainer.contains(mutation.target) ||
        this.textarea.contains(mutation.target)) {
      return true
    }
    return false
  }

  destroy() {
    // Cleanup if needed
  }
}

export function mermaidNodeView(node: PmNode, view: EditorView, getPos: () => number | undefined): NodeView {
  return new MermaidNodeView(node, view, getPos)
}

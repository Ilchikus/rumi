import { Node as PmNode } from "prosemirror-model"
import { EditorView, NodeView } from "prosemirror-view"

type MermaidApi = typeof import("mermaid")["default"]

let mermaidPromise: Promise<MermaidApi> | null = null

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
    })
    return mermaid
  })
  return mermaidPromise
}

const VIEW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"></path></svg>`
const EDIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"></path></svg>`
const SPLIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V200H136V56ZM40,56h80V200H40Z"></path></svg>`

type MermaidMode = "view" | "edit" | "split"

let mermaidIdCounter = 0

class MermaidNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private node: PmNode
  private view: EditorView
  private getPos: () => number | undefined
  private mode: MermaidMode
  private previewContainer: HTMLElement
  private editorContainer: HTMLElement
  private toolbar: HTMLElement
  private errorEl: HTMLElement
  private mermaidId: string
  private renderRevision = 0

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

    this.contentDOM = document.createElement("code")
    this.contentDOM.className = "mermaid-textarea"
    this.contentDOM.dataset.placeholder = "Enter Mermaid diagram code..."
    this.contentDOM.spellcheck = false
    this.editorContainer.appendChild(this.contentDOM)

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

  private async renderDiagram() {
    const renderRevision = ++this.renderRevision
    const code = this.node.textContent
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

      // Mermaid is large, so defer loading it until a diagram actually needs
      // rendering. A newer update may supersede this one while it loads.
      const mermaid = await loadMermaid()
      if (renderRevision !== this.renderRevision) return
      const { svg } = await mermaid.render(
        `${this.mermaidId}-${renderRevision}`,
        code
      )
      if (renderRevision !== this.renderRevision) return
      diagramContainer.innerHTML = svg
    } catch (error) {
      if (renderRevision !== this.renderRevision) return
      this.errorEl.textContent = `Error: ${error instanceof Error ? error.message : "Invalid diagram"}`
      this.errorEl.style.display = "block"
    }
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false

    const modeChanged = node.attrs.mode !== this.node.attrs.mode
    const codeChanged = node.textContent !== this.node.textContent

    this.node = node

    if (modeChanged) {
      this.mode = node.attrs.mode || "split"
      this.updateMode()
    }

    if (codeChanged) this.renderDiagram()

    return true
  }

  stopEvent(event: Event): boolean {
    // Let toolbar controls handle their own events. Mermaid source remains
    // ordinary ProseMirror content, just like a code block.
    const target = event.target as HTMLElement
    return this.toolbar.contains(target)
  }

  ignoreMutation(
    mutation: Parameters<NonNullable<NodeView["ignoreMutation"]>>[0]
  ): boolean {
    if (this.toolbar.contains(mutation.target) ||
        this.previewContainer.contains(mutation.target)) {
      return true
    }
    return false
  }

  destroy() {
    // Ignore any Mermaid render that settles after this view is gone.
    this.renderRevision += 1
  }
}

export function mermaidNodeView(node: PmNode, view: EditorView, getPos: () => number | undefined): NodeView {
  return new MermaidNodeView(node, view, getPos)
}

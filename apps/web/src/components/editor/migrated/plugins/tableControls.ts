// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import {
  addRowAfter,
  addRowBefore,
  deleteRow,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  isInTable
} from "prosemirror-tables"

export const tableControlsKey = new PluginKey("tableControls")

const PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path></svg>`
const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"></path></svg>`
const ROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M208,136H48a16,16,0,0,0-16,16v40a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V152A16,16,0,0,0,208,136Zm0,56H48V152H208v40ZM208,48H48A16,16,0,0,0,32,64v40a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V64A16,16,0,0,0,208,48Zm0,56H48V64H208v40Z"></path></svg>`
const COL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M104,32H64A16,16,0,0,0,48,48V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,104,32Zm0,176H64V48h40ZM192,32H152a16,16,0,0,0-16,16V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,192,32Zm0,176H152V48h40Z"></path></svg>`

class TableControlsView {
  private view: EditorView
  private toolbar: HTMLElement
  private styleEl: HTMLStyleElement

  constructor(view: EditorView) {
    this.view = view

    // Add styles
    this.styleEl = document.createElement("style")
    this.styleEl.textContent = `
      .table-controls-toolbar {
        position: fixed;
        display: none;
        align-items: center;
        gap: 4px;
        padding: 4px;
        background: hsl(var(--popover));
        border: 1px solid hsl(var(--border));
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        z-index: 100;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .table-controls-toolbar.visible {
        display: flex;
      }
      .table-controls-group {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .table-controls-separator {
        width: 1px;
        height: 20px;
        background: hsl(var(--border));
        margin: 0 4px;
      }
      .table-controls-label {
        font-size: 11px;
        color: hsl(var(--muted-foreground));
        font-weight: 500;
        margin-right: 4px;
      }
      .table-control-btn {
        width: 26px;
        height: 26px;
        border: none;
        background: transparent;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: hsl(var(--muted-foreground));
        transition: background 150ms, color 150ms;
      }
      .table-control-btn:hover {
        background: hsl(var(--accent));
        color: hsl(var(--foreground));
      }
      .table-control-btn.delete:hover {
        background: hsl(var(--destructive) / 0.1);
        color: hsl(var(--destructive));
      }
      .table-control-btn .icon-label {
        font-size: 10px;
        font-weight: 600;
        margin-left: 1px;
      }
    `
    document.head.appendChild(this.styleEl)

    this.toolbar = this.createToolbar()
    document.body.appendChild(this.toolbar)
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement("div")
    toolbar.className = "table-controls-toolbar"

    // Row controls
    const rowGroup = document.createElement("div")
    rowGroup.className = "table-controls-group"

    const rowLabel = document.createElement("span")
    rowLabel.className = "table-controls-label"
    rowLabel.textContent = "Row"
    rowGroup.appendChild(rowLabel)

    rowGroup.appendChild(this.createButton(PLUS_SVG, "↑", "Add row above", () => {
      addRowBefore(this.view.state, this.view.dispatch)
      this.view.focus()
    }))

    rowGroup.appendChild(this.createButton(PLUS_SVG, "↓", "Add row below", () => {
      addRowAfter(this.view.state, this.view.dispatch)
      this.view.focus()
    }))

    rowGroup.appendChild(this.createButton(TRASH_SVG, "", "Delete row", () => {
      deleteRow(this.view.state, this.view.dispatch)
      this.view.focus()
    }, true))

    toolbar.appendChild(rowGroup)

    // Separator
    const sep = document.createElement("div")
    sep.className = "table-controls-separator"
    toolbar.appendChild(sep)

    // Column controls
    const colGroup = document.createElement("div")
    colGroup.className = "table-controls-group"

    const colLabel = document.createElement("span")
    colLabel.className = "table-controls-label"
    colLabel.textContent = "Col"
    colGroup.appendChild(colLabel)

    colGroup.appendChild(this.createButton(PLUS_SVG, "←", "Add column left", () => {
      addColumnBefore(this.view.state, this.view.dispatch)
      this.view.focus()
    }))

    colGroup.appendChild(this.createButton(PLUS_SVG, "→", "Add column right", () => {
      addColumnAfter(this.view.state, this.view.dispatch)
      this.view.focus()
    }))

    colGroup.appendChild(this.createButton(TRASH_SVG, "", "Delete column", () => {
      deleteColumn(this.view.state, this.view.dispatch)
      this.view.focus()
    }, true))

    toolbar.appendChild(colGroup)

    return toolbar
  }

  private createButton(icon: string, label: string, title: string, onClick: () => void, isDelete = false): HTMLElement {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "table-control-btn" + (isDelete ? " delete" : "")
    btn.title = title
    btn.innerHTML = icon + (label ? `<span class="icon-label">${label}</span>` : "")
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    })
    return btn
  }

  update(view: EditorView) {
    this.view = view

    // Check if we're in a table
    const { state } = view

    if (!isInTable(state)) {
      this.toolbar.classList.remove("visible")
      return
    }

    // Find the table node
    const { selection } = state
    const $pos = selection.$anchor
    let tablePos: number | null = null

    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.name === "table") {
        tablePos = $pos.before(d)
        break
      }
    }

    if (tablePos === null) {
      this.toolbar.classList.remove("visible")
      return
    }

    // Get the table DOM element
    const tableDOM = view.nodeDOM(tablePos)
    if (!tableDOM || !(tableDOM instanceof HTMLElement)) {
      this.toolbar.classList.remove("visible")
      return
    }

    // Position toolbar above the table
    const tableRect = tableDOM.getBoundingClientRect()
    const toolbarRect = this.toolbar.getBoundingClientRect()

    let left = tableRect.left
    let top = tableRect.top - toolbarRect.height - 8

    // Keep within viewport
    if (left + toolbarRect.width > window.innerWidth) {
      left = window.innerWidth - toolbarRect.width - 8
    }
    if (top < 8) {
      // Show below table if not enough space above
      top = tableRect.bottom + 8
    }

    this.toolbar.style.left = `${left}px`
    this.toolbar.style.top = `${top}px`
    this.toolbar.classList.add("visible")
  }

  destroy() {
    this.styleEl.remove()
    this.toolbar.remove()
  }
}

export function tableControlsPlugin() {
  return new Plugin({
    key: tableControlsKey,
    view(editorView) {
      return new TableControlsView(editorView)
    }
  })
}

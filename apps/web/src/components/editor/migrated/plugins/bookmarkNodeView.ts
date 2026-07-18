// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Node as PmNode } from "prosemirror-model"
import { EditorView, NodeView } from "prosemirror-view"
import { openEditorHref } from "../platform"

const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"></path></svg>`
const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"></path></svg>`
const EDIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"></path></svg>`

class BookmarkView implements NodeView {
  dom: HTMLElement
  private toolbar: HTMLElement | null = null
  private editInput: HTMLInputElement | null = null
  private isEditing: boolean = false

  constructor(private node: PmNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom = document.createElement("div")
    this.dom.className = "bookmark-block"
    this.dom.contentEditable = "false"

    this.render()

    // If no title yet and has URL, try cache first, then fetch
    // Defer updates until after construction to avoid ProseMirror initialization conflicts
    if (node.attrs.url && !node.attrs.title) {
      const cached = this.getCachedMeta(node.attrs.url)
      if (cached) {
        // Schedule update for next tick
        Promise.resolve().then(() => this.updateNodeMeta(cached))
      } else {
        this.fetchMeta(node.attrs.url)
      }
    }
  }

  private render() {
    const { url, title, description, favicon } = this.node.attrs
    this.dom.innerHTML = ""

    // Show URL input if no URL (new bookmark)
    if (!url) {
      this.renderUrlInput()
      return
    }

    // If editing, show the edit input
    if (this.isEditing) {
      this.renderEditMode()
      return
    }

    // Create wrapper for positioning
    const wrapper = document.createElement("div")
    wrapper.className = "bookmark-wrapper"
    wrapper.style.position = "relative"

    const card = document.createElement("a")
    card.className = "bookmark-card"
    card.href = url
    card.addEventListener("click", (e) => {
      e.preventDefault()
      openEditorHref(url)
    })

    const textSection = document.createElement("div")
    textSection.className = "bookmark-text"

    const titleEl = document.createElement("div")
    titleEl.className = "bookmark-title"
    titleEl.textContent = title || url
    textSection.appendChild(titleEl)

    if (description) {
      const descEl = document.createElement("div")
      descEl.className = "bookmark-description"
      descEl.textContent = description
      textSection.appendChild(descEl)
    }

    const urlEl = document.createElement("div")
    urlEl.className = "bookmark-url"

    if (favicon) {
      const faviconImg = document.createElement("img")
      faviconImg.src = favicon
      faviconImg.className = "bookmark-favicon"
      faviconImg.width = 14
      faviconImg.height = 14
      faviconImg.onerror = () => { faviconImg.style.display = "none" }
      urlEl.appendChild(faviconImg)
    }

    const urlText = document.createElement("span")
    try {
      urlText.textContent = new URL(url).hostname
    } catch {
      urlText.textContent = url
    }
    urlEl.appendChild(urlText)
    textSection.appendChild(urlEl)

    card.appendChild(textSection)
    wrapper.appendChild(card)

    // Add toolbar
    this.toolbar = this.createToolbar()
    wrapper.appendChild(this.toolbar)

    this.dom.appendChild(wrapper)
  }

  private renderUrlInput() {
    const container = document.createElement("div")
    container.className = "bookmark-input-container"

    const input = document.createElement("input")
    input.type = "text"
    input.className = "bookmark-url-input"
    input.placeholder = "Paste URL and press Enter..."
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        const url = input.value.trim()
        if (url) {
          this.updateUrl(url)
        }
      }
      if (e.key === "Escape") {
        e.preventDefault()
        // Delete the bookmark if escaping from empty state
        this.deleteBlock()
      }
      e.stopPropagation()
    })

    container.appendChild(input)
    this.dom.appendChild(container)

    // Focus the input
    requestAnimationFrame(() => input.focus())
  }

  private renderEditMode() {
    const container = document.createElement("div")
    container.className = "bookmark-input-container"

    const input = document.createElement("input")
    input.type = "text"
    input.className = "bookmark-url-input"
    input.value = this.node.attrs.url || ""
    input.placeholder = "Enter URL..."
    this.editInput = input

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        const url = input.value.trim()
        if (url) {
          this.updateUrl(url)
        }
        this.isEditing = false
        this.render()
      }
      if (e.key === "Escape") {
        e.preventDefault()
        this.isEditing = false
        this.render()
      }
      e.stopPropagation()
    })

    input.addEventListener("blur", () => {
      // Small delay to allow click events on toolbar
      setTimeout(() => {
        if (this.isEditing) {
          this.isEditing = false
          this.render()
        }
      }, 150)
    })

    container.appendChild(input)
    this.dom.appendChild(container)

    requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement("div")
    toolbar.className = "bookmark-toolbar"

    // Copy button
    const copyBtn = document.createElement("button")
    copyBtn.type = "button"
    copyBtn.className = "bookmark-toolbar-btn"
    copyBtn.title = "Copy URL"
    copyBtn.innerHTML = COPY_SVG
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      navigator.clipboard.writeText(this.node.attrs.url || "")
      // Show checkmark icon briefly
      copyBtn.innerHTML = CHECK_SVG
      copyBtn.style.color = "hsl(142, 71%, 45%)"
      setTimeout(() => {
        copyBtn.innerHTML = COPY_SVG
        copyBtn.style.color = ""
      }, 1000)
    })
    toolbar.appendChild(copyBtn)

    // Edit button
    const editBtn = document.createElement("button")
    editBtn.type = "button"
    editBtn.className = "bookmark-toolbar-btn"
    editBtn.title = "Edit URL"
    editBtn.innerHTML = EDIT_SVG
    editBtn.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.isEditing = true
      this.render()
    })
    toolbar.appendChild(editBtn)

    return toolbar
  }

  private updateUrl(url: string) {
    const pos = this.getPos()
    if (pos === undefined) return

    // Reset metadata when URL changes
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
      url,
      title: null,
      description: null,
      favicon: null
    })
    this.view.dispatch(tr)

    // Fetch new metadata
    this.fetchMeta(url)
  }

  private deleteBlock() {
    const pos = this.getPos()
    if (pos === undefined) return

    const node = this.view.state.doc.nodeAt(pos)
    if (!node) return

    const tr = this.view.state.tr.delete(pos, pos + node.nodeSize)
    this.view.dispatch(tr)
    this.view.focus()
  }

  private getCachedMeta(url: string): { title?: string; description?: string; favicon?: string } | null {
    try {
      const cache = localStorage.getItem('rumi-bookmark-cache')
      if (!cache) return null

      const parsed = JSON.parse(cache)
      return parsed[url] || null
    } catch {
      return null
    }
  }

  private setCachedMeta(url: string, meta: { title?: string; description?: string; favicon?: string }) {
    try {
      const cache = localStorage.getItem('rumi-bookmark-cache')
      const parsed = cache ? JSON.parse(cache) : {}

      parsed[url] = {
        ...meta,
        cachedAt: Date.now()
      }

      localStorage.setItem('rumi-bookmark-cache', JSON.stringify(parsed))
    } catch {
      // Ignore cache errors
    }
  }

  private updateNodeMeta(meta: { title?: string; description?: string; favicon?: string }) {
    const pos = this.getPos()
    if (pos === undefined) return

    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      title: meta.title || this.node.attrs.title,
      description: meta.description || this.node.attrs.description,
      favicon: meta.favicon || this.node.attrs.favicon
    })
    this.view.dispatch(tr)
  }

  private async fetchMeta(url: string) {
    try {
      const parsed = new URL(url)
      const meta = {
        title: parsed.hostname,
        favicon: `${parsed.origin}/favicon.ico`
      }

      // Cache the fetched metadata
      this.setCachedMeta(url, meta)

      // Update the node
      this.updateNodeMeta(meta)
    } catch {
      // Ignore fetch errors
    }
  }

  update(node: PmNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    // Don't re-render if we're in edit mode
    if (!this.isEditing) {
      this.render()
    }
    return true
  }

  stopEvent(event: Event): boolean {
    // Allow input events
    if (event.target instanceof HTMLInputElement) {
      return true
    }
    // Allow toolbar button clicks
    if (this.toolbar?.contains(event.target as Node)) {
      return true
    }
    return true
  }

  ignoreMutation(): boolean {
    return true
  }
}

export function bookmarkNodeView(node: PmNode, view: EditorView, getPos: () => number | undefined): NodeView {
  return new BookmarkView(node, view, getPos)
}

// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, NodeSelection, TextSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema, Node as PmNode, Fragment } from "prosemirror-model"
import { setBlockType, wrapIn } from "prosemirror-commands"
import { multiBlockSelectionKey, selectBlock, deleteSelectedBlocks, duplicateSelectedBlocks } from "./multiBlockSelection"
import { collapsibleHeadingsKey, findSectionEnd } from "./collapsibleHeadings"
import { BLOCK_TYPE_OPTIONS, type BlockTypeOption } from "./blockTypePresentation"
import { listDropIndent } from "../listDropIndent"

export const blockDragHandleKey = new PluginKey("blockDragHandle")

const GRIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M108,60A16,16,0,1,1,92,44,16,16,0,0,1,108,60Zm56-16a16,16,0,1,0,16,16A16,16,0,0,0,164,44ZM92,112a16,16,0,1,0,16,16A16,16,0,0,0,92,112Zm72,0a16,16,0,1,0,16,16A16,16,0,0,0,164,112ZM92,180a16,16,0,1,0,16,16A16,16,0,0,0,92,180Zm72,0a16,16,0,1,0,16,16A16,16,0,0,0,164,180Z"></path></svg>`
const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"></path></svg>`
const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"></path></svg>`
const PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path></svg>`


const HOVER_ZONE = 64
const HANDLE_OFFSET = 28
const ADD_BUTTON_OFFSET = 52
const AREA_SELECT_DRAG_THRESHOLD = 3

interface HandledBlock {
  pos: number
  node: PmNode
  depth: number
  isNested: boolean
}

class BlockDragHandleView {
  private handle: HTMLElement
  private addButton: HTMLElement
  private dropIndicator: HTMLElement
  private headingHighlight: HTMLElement
  private dragGhost: HTMLElement | null = null
  private contextMenu: HTMLElement | null = null
  private listContainer: HTMLElement | null = null
  private filteredItems: { kind: "action" | "type"; index: number }[] = []
  private activeItemIndex: number = 0
  private styleEl: HTMLStyleElement
  private view: EditorView
  private hoveredBlock: HandledBlock | null = null
  private hoveredBlockRect: DOMRect | null = null
  private draggedBlock: HandledBlock | null = null
  private draggedBlockX: number = 0
  private scrollParent: HTMLElement | null = null
  private menuBlock: HandledBlock | null = null

  // RAF throttle for mousemove — process only the latest event per animation frame
  private mouseMoveRafId: number | null = null
  private pendingMouseEvent: MouseEvent | null = null

  // Area selection state
  private selectionRect: HTMLElement | null = null
  private isAreaSelecting: boolean = false
  private areaSelectStart: { x: number; y: number } | null = null
  private areaHighlightedBlocks: Set<number> = new Set()
  private suppressWrapperClick: boolean = false

  // Indent-on-drag state (for list items)
  private targetIndent: number = 0
  private readonly MAX_INDENT = 3 // Max 4 levels (0, 1, 2, 3)
  private readonly INDENT_MARGIN_PX = 24 // 1.5em at 16px = 24px per indent level

  constructor(view: EditorView) {
    this.view = view

    this.styleEl = document.createElement("style")
    this.styleEl.textContent = `
      .ProseMirror .ProseMirror-selectednode {
        outline: none !important;
        background: hsl(213, 94%, 95%);
        border-radius: 4px;
      }
      .block-drag-ghost {
        position: fixed;
        pointer-events: none;
        z-index: 102;
        opacity: 0.5;
        background: white;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        overflow: hidden;
        max-height: 200px;
      }
      .block-context-menu {
        position: fixed;
        z-index: 200;
        background: #fff;
        border: 1px solid hsl(var(--border));
        border-radius: 8px;
        padding: 4px;
        min-width: 220px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px;
      }
      .block-context-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        color: hsl(var(--popover-foreground));
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        font-size: 13px;
        font-family: inherit;
      }
      .block-context-menu-item:hover,
      .block-context-menu-item.active {
        background: hsl(var(--accent));
      }
      .block-context-menu-item.destructive:hover,
      .block-context-menu-item.destructive.active {
        background: hsl(var(--destructive) / 0.1);
        color: hsl(var(--destructive));
      }
      .block-context-menu-item.destructive:hover .item-icon,
      .block-context-menu-item.destructive.active .item-icon,
      .block-context-menu-item.destructive:hover .shortcut,
      .block-context-menu-item.destructive.active .shortcut {
        color: hsl(var(--destructive));
      }
      .block-context-menu-item .item-icon {
        width: 20px;
        text-align: center;
        font-size: 12px;
        font-weight: 600;
        color: hsl(var(--muted-foreground));
        flex-shrink: 0;
      }
      .block-context-menu-item .item-label {
        flex: 1;
      }
      .block-context-menu-item .shortcut {
        color: hsl(var(--muted-foreground));
        font-size: 12px;
        margin-left: auto;
        flex-shrink: 0;
      }
      .block-context-menu-separator {
        height: 1px;
        background: hsl(var(--border));
        margin: 4px 0;
      }
      .block-context-menu-label {
        padding: 4px 8px 2px;
        font-size: 12px;
        font-weight: 600;
        color: hsl(var(--muted-foreground));
      }
      .block-type-search {
        width: 100%;
        border: none;
        outline: none;
        padding: 6px 8px;
        font-size: 13px;
        font-family: inherit;
        background: transparent;
        color: hsl(var(--foreground));
      }
      .block-type-search::placeholder {
        color: hsl(var(--muted-foreground));
      }
      .area-select-rect {
        position: fixed;
        pointer-events: none;
        z-index: 50;
        background: hsl(213, 94%, 55%, 0.2);
        border: 0;
        border-radius: 4px;
      }
    `
    document.head.appendChild(this.styleEl)

    this.handle = this.createHandle()
    this.addButton = this.createAddButton()
    this.dropIndicator = this.createDropIndicator()
    this.headingHighlight = this.createHeadingHighlight()

    this.scrollParent = this.findScrollParent(this.view.dom)

    const handleParent = this.getEditorWrapper() ?? document.body
    handleParent.appendChild(this.handle)
    handleParent.appendChild(this.addButton)
    document.body.appendChild(this.dropIndicator)
    document.body.appendChild(this.headingHighlight)

    document.addEventListener("mousemove", this.onDocMouseMove)
    document.addEventListener("mousedown", this.onDocMouseDown)
    document.addEventListener("keydown", this.onDocKeyDown)

    // Area selection: listen on the full editor canvas, including the wide
    // side gutters and viewport space outside the centered article.
    const surface = this.getAreaSelectionSurface()
    if (surface) {
      surface.addEventListener("mousedown", this.onWrapperMouseDown, true)
      surface.addEventListener("mousemove", this.onWrapperMouseMove)
      surface.addEventListener("click", this.onWrapperClick, true)
    }

    if (this.scrollParent) {
      this.scrollParent.addEventListener("scroll", this.onScroll, { passive: true })
    }
  }

  private findScrollParent(el: HTMLElement): HTMLElement | null {
    let node = el.parentElement
    while (node) {
      const overflow = getComputedStyle(node).overflowY
      if (overflow === "auto" || overflow === "scroll") return node
      node = node.parentElement
    }
    return null
  }

  private createHandle(): HTMLElement {
    const el = document.createElement("button")
    el.type = "button"
    el.title = "Select and drag block"
    el.setAttribute("aria-label", "Select and drag block")
    el.style.cssText = `
      position: absolute;
      width: 20px;
      height: 20px;
      padding: 0;
      margin: 0;
      border: none;
      outline: none;
      background: transparent;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: grab;
      border-radius: 4px;
      user-select: none;
      z-index: 100;
      color: hsl(215.4, 16.3%, 46.9%);
      transition: background 150ms;
    `
    el.innerHTML = GRIP_SVG

    el.addEventListener("mouseenter", () => {
      el.style.background = "hsl(210, 40%, 96.1%)"
    })
    el.addEventListener("mouseleave", () => {
      el.style.background = "transparent"
    })
    el.addEventListener("mousedown", this.onHandleMouseDown)
    el.addEventListener("contextmenu", this.onHandleContextMenu)
    el.addEventListener("dragstart", this.onDragStart)
    el.addEventListener("dragend", this.onDragEnd)
    el.draggable = true

    return el
  }

  private createAddButton(): HTMLElement {
    const el = document.createElement("button")
    el.type = "button"
    el.title = "Add block below"
    el.setAttribute("aria-label", "Add block below")
    el.style.cssText = `
      position: absolute;
      width: 20px;
      height: 20px;
      padding: 0;
      margin: 0;
      border: none;
      outline: none;
      background: transparent;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 4px;
      user-select: none;
      z-index: 100;
      color: hsl(215.4, 16.3%, 46.9%);
      transition: background 150ms, color 150ms;
    `
    el.innerHTML = PLUS_SVG

    el.addEventListener("mouseenter", () => {
      el.style.background = "hsl(210, 40%, 96.1%)"
      el.style.color = "hsl(var(--foreground))"
    })
    el.addEventListener("mouseleave", () => {
      el.style.background = "transparent"
      el.style.color = "hsl(215.4, 16.3%, 46.9%)"
    })
    el.addEventListener("mousedown", (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    el.addEventListener("click", this.onAddButtonClick)

    return el
  }

  private createDropIndicator(): HTMLElement {
    const el = document.createElement("div")
    el.style.cssText = `
      position: fixed;
      height: 2px;
      background: hsl(222.2, 47.4%, 41.2%);
      border-radius: 1px;
      display: none;
      z-index: 101;
      pointer-events: none;
    `
    return el
  }

  private createHeadingHighlight(): HTMLElement {
    const el = document.createElement("div")
    el.style.cssText = `
      position: fixed;
      background: hsl(213, 94%, 95%);
      border-radius: 4px;
      pointer-events: none;
      z-index: 101;
      display: none;
    `
    return el
  }

  // ── Block detection ──

  private findHandledBlock(resolvedPos: number): HandledBlock | null {
    const { doc } = this.view.state
    const $pos = doc.resolve(resolvedPos)

    // Walk from deepest to shallowest, find first block node
    // This supports nested blocks (e.g., blocks inside toggle/details)
    for (let depth = $pos.depth; depth >= 1; depth--) {
      const node = $pos.node(depth)
      const nodePos = $pos.before(depth)

      // Check if this is a block node (group === "block")
      if (node.type.spec.group === "block") {
        return {
          pos: nodePos,
          node,
          depth,
          isNested: depth > 1
        }
      }
    }
    return null
  }

  private blocksEqual(a: HandledBlock | null, b: HandledBlock | null): boolean {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return a.pos === b.pos
  }

  // Find the deepest block node at the given vertical position
  private findBlockByVerticalPosition(clientY: number): HandledBlock | null {
    const doc = this.view.state.doc
    let deepestMatch: HandledBlock | null = null
    let maxDepth = 0

    const checkNode = (node: PmNode, pos: number, depth: number) => {
      try {
        const dom = this.view.nodeDOM(pos)
        if (!dom || !(dom instanceof HTMLElement)) return

        const rect = dom.getBoundingClientRect()
        if (clientY >= rect.top && clientY <= rect.bottom) {
          // This node contains the mouse vertically
          if (node.type.spec.group === "block" && depth >= maxDepth) {
            deepestMatch = {
              pos,
              node,
              depth,
              isNested: depth > 1
            }
            maxDepth = depth
          }

          // Recursively check children
          if (node.content) {
            let childOffset = pos + 1
            node.forEach((child, offset) => {
              checkNode(child, childOffset + offset, depth + 1)
            })
          }
        }
      } catch {
        // Ignore errors accessing DOM
      }
    }

    // Start checking from top-level nodes
    doc.forEach((node, nodeOffset) => {
      checkNode(node, nodeOffset, 1)
    })

    return deepestMatch
  }

  // ── Mouse tracking ──

  private onDocMouseMove = (e: MouseEvent) => {
    // RAF throttle: store latest event and process it on the next animation frame.
    // This reduces getBoundingClientRect / posAtCoords calls from ~200/s to ~60/s.
    this.pendingMouseEvent = e
    if (this.mouseMoveRafId !== null) return
    this.mouseMoveRafId = requestAnimationFrame(() => {
      this.mouseMoveRafId = null
      const ev = this.pendingMouseEvent!
      this.pendingMouseEvent = null
      this.handleMouseMove(ev)
    })
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (this.draggedBlock !== null) return

    // Keep the controls visible while moving between the block, add button, and grip.
    if (this.handle.contains(e.target as Node) || this.addButton.contains(e.target as Node)) {
      return
    }

    const editorRect = this.view.dom.getBoundingClientRect()
    const mx = e.clientX
    const my = e.clientY

    // Calculate the maximum indentation gap (for extending hover zone)
    const maxIndentGap = this.MAX_INDENT * this.INDENT_MARGIN_PX

    if (mx < editorRect.left - HOVER_ZONE || mx > editorRect.right ||
        my < editorRect.top || my > editorRect.bottom) {
      this.hideHandle()
      return
    }

    // If mouse is within editor bounds but might be in an indentation gap,
    // check if we should use vertical-only detection for indented blocks
    if (mx >= editorRect.left && mx < editorRect.left + maxIndentGap) {
      // Potentially in an indentation gap - try posAtCoords first
      const pos = this.view.posAtCoords({ left: mx, top: my })
      if (pos) {
        const block = this.findHandledBlock(pos.pos)
        if (block) {
          if (!this.blocksEqual(block, this.hoveredBlock)) {
            this.hoveredBlock = block
            this.positionHandle()
          }
          return
        }
      }
      // posAtCoords didn't find a block - use vertical detection for indented items
      // Fall through to vertical-only detection below
    } else if (mx >= editorRect.left) {
      // Inside main content area (not in indentation gap)

      // Sticky detection: if we're hovering a block and mouse is still vertically aligned,
      // keep showing the same handle even if moving horizontally toward the handle
      if (this.hoveredBlock !== null && this.hoveredBlockRect) {
        if (my >= this.hoveredBlockRect.top && my <= this.hoveredBlockRect.bottom) {
          return
        }
      }

      const pos = this.view.posAtCoords({ left: mx, top: my })
      if (!pos) { this.hideHandle(); return }
      const block = this.findHandledBlock(pos.pos)
      if (!block) { this.hideHandle(); return }
      if (!this.blocksEqual(block, this.hoveredBlock)) {
        this.hoveredBlock = block
        this.positionHandle()
      }
      return
    }

    // Mouse is in the hover zone left of the editor OR in an indentation gap
    // Use vertical-only detection to find blocks (including nested ones)
    if (this.hoveredBlock !== null && this.hoveredBlockRect) {
      if (my >= this.hoveredBlockRect.top && my <= this.hoveredBlockRect.bottom) return
    }

    // Recursively find which block's vertical range the mouse is in
    // Check nested blocks first (deepest first) to prefer nested over parent
    const foundBlock = this.findBlockByVerticalPosition(my)
    if (foundBlock) {
      if (!this.blocksEqual(foundBlock, this.hoveredBlock)) {
        this.hoveredBlock = foundBlock
        this.positionHandle()
      }
    } else {
      this.hideHandle()
    }
  }

  private onDocMouseDown = (e: MouseEvent) => {
    if (this.contextMenu && !this.contextMenu.contains(e.target as Node) &&
        e.target !== this.handle) {
      this.closeContextMenu()
    }

    // Don't clear multi-block selection when clicking inside the context menu
    // (e.g. clicking a type-change option must see the full selectedBlocks list)
    if (this.contextMenu && this.contextMenu.contains(e.target as Node)) return

    // Clear multi-block selection on any click except on the handle of a selected block.
    // Handle clicks call stopPropagation(), so they never reach this handler —
    // onHandleMouseDown takes care of preserving or changing selection in that case.
    const pluginState = multiBlockSelectionKey.getState(this.view.state)
    if (pluginState && pluginState.selectedBlocks && pluginState.selectedBlocks.length > 0) {
      let tr = this.view.state.tr
      // NodeSelection (set by drag handle) also shows as blue — clear it too
      if (this.view.state.selection instanceof NodeSelection) {
        const sel = this.view.state.selection
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(sel.from + 1)))
      }
      tr = tr.setMeta(multiBlockSelectionKey, { selectedBlocks: [], anchorBlock: null })
      this.view.dispatch(tr)
    }
  }

  private onDocKeyDown = (e: KeyboardEvent) => {
    // Handle Escape to clear multi-block selection
    if (e.key === "Escape") {
      const pluginState = multiBlockSelectionKey.getState(this.view.state)
      if (pluginState && pluginState.selectedBlocks && pluginState.selectedBlocks.length > 0) {
        const tr = this.view.state.tr.setMeta(multiBlockSelectionKey, {
          selectedBlocks: [],
          anchorBlock: null
        })
        this.view.dispatch(tr)
        this.view.focus()
      }
    }
  }

  private onScroll = () => {
    if (this.hoveredBlock !== null && this.draggedBlock === null) {
      // The handle lives in the editor wrapper, so the browser scrolls it with
      // its block. Refresh only viewport visibility and hover geometry here;
      // rewriting fixed coordinates on every scroll frame caused visible lag.
      const dom = this.view.nodeDOM(this.hoveredBlock.pos)
      if (!dom || !(dom instanceof HTMLElement)) {
        this.hideHandle()
      } else {
        const rect = dom.getBoundingClientRect()
        this.hoveredBlockRect = rect
        if (this.scrollParent) {
          const parentRect = this.scrollParent.getBoundingClientRect()
          const visible = !(rect.bottom < parentRect.top || rect.top > parentRect.bottom)
          this.handle.style.display = visible ? "flex" : "none"
          this.addButton.style.display = visible ? "flex" : "none"
        }
      }
    }
    this.closeContextMenu()
  }

  // ── Area Selection ──

  private editorWrapper: HTMLElement | null = null
  private areaSelectionSurface: HTMLElement | null = null

  private getEditorWrapper(): HTMLElement | null {
    if (this.editorWrapper) return this.editorWrapper
    // Find the wrapper element (prosemirror-editor-wrapper)
    let el = this.view.dom.parentElement
    while (el) {
      if (el.classList.contains("prosemirror-editor-wrapper")) {
        this.editorWrapper = el
        return el
      }
      el = el.parentElement
    }
    return this.view.dom.parentElement
  }

  private getAreaSelectionSurface(): HTMLElement | null {
    if (this.areaSelectionSurface) return this.areaSelectionSurface
    const canvas = this.view.dom.closest("[data-rumi-editor-canvas]")
    this.areaSelectionSurface = canvas instanceof HTMLElement ? canvas : this.getEditorWrapper()
    return this.areaSelectionSurface
  }

  private isEditorBlockTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false

    // A direct hit on .ProseMirror is blank canvas. Descendants are rendered
    // blocks and keep native ProseMirror text-selection behavior.
    return target !== this.view.dom && this.view.dom.contains(target)
  }

  private isAreaSelectionExcludedTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false
    const element = target instanceof Element ? target : target.parentElement
    return Boolean(element?.closest("[data-rumi-area-selection-exclude]"))
  }

  private onWrapperMouseMove = (e: MouseEvent) => {
    // Update cursor based on whether we're outside ProseMirror
    if (this.isAreaSelecting || this.draggedBlock !== null) return

    const surface = this.getAreaSelectionSurface()
    if (!surface) return

    const surfaceRect = surface.getBoundingClientRect()
    const inSurface = e.clientX >= surfaceRect.left && e.clientX <= surfaceRect.right &&
                      e.clientY >= surfaceRect.top && e.clientY <= surfaceRect.bottom

    if (!inSurface) {
      surface.style.cursor = ""
      return
    }

    surface.style.cursor = this.isEditorBlockTarget(e.target) || this.isAreaSelectionExcludedTarget(e.target)
      ? ""
      : "default"
  }

  private onWrapperMouseDown = (e: MouseEvent) => {
    // Only handle left click
    if (e.button !== 0) return

    // Don't interfere with handle interactions
    if (this.handle.contains(e.target as Node) || this.addButton.contains(e.target as Node)) return

    // Don't interfere if context menu is open
    if (this.contextMenu) return

    // Page title, properties, and database controls are inside the full canvas
    // but are not part of block marquee selection.
    if (this.isAreaSelectionExcludedTarget(e.target)) return

    if (this.isEditorBlockTarget(e.target)) {
      // A rendered block keeps native ProseMirror text selection.
      return
    }

    // Blank ProseMirror canvas and the surrounding editor padding are marquee zones.
    // Clear any existing multi-block selection first
    const pluginState = multiBlockSelectionKey.getState(this.view.state)
    if (pluginState && pluginState.selectedBlocks && pluginState.selectedBlocks.length > 0) {
      const tr = this.view.state.tr.setMeta(multiBlockSelectionKey, {
        selectedBlocks: [],
        anchorBlock: null
      })
      this.view.dispatch(tr)
    }

    // Start area selection
    e.preventDefault()
    e.stopPropagation()

    this.isAreaSelecting = true
    this.areaSelectStart = { x: e.clientX, y: e.clientY }
    this.areaHighlightedBlocks.clear()
    this.suppressWrapperClick = false

    // Create selection rectangle
    this.selectionRect = document.createElement("div")
    this.selectionRect.className = "area-select-rect"
    this.selectionRect.style.left = `${e.clientX}px`
    this.selectionRect.style.top = `${e.clientY}px`
    this.selectionRect.style.width = "0"
    this.selectionRect.style.height = "0"
    document.body.appendChild(this.selectionRect)

    // Add mousemove and mouseup listeners
    document.addEventListener("mousemove", this.onAreaSelectMove)
    document.addEventListener("mouseup", this.onAreaSelectEnd)
  }

  private onAreaSelectMove = (e: MouseEvent) => {
    if (!this.isAreaSelecting || !this.areaSelectStart || !this.selectionRect) {
      return
    }

    const startX = this.areaSelectStart.x
    const startY = this.areaSelectStart.y
    const currentX = e.clientX
    const currentY = e.clientY

    // Calculate rectangle bounds
    const left = Math.min(startX, currentX)
    const top = Math.min(startY, currentY)
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)

    if (width >= AREA_SELECT_DRAG_THRESHOLD || height >= AREA_SELECT_DRAG_THRESHOLD) {
      this.suppressWrapperClick = true
    }

    // Update selection rectangle position
    this.selectionRect.style.left = `${left}px`
    this.selectionRect.style.top = `${top}px`
    this.selectionRect.style.width = `${width}px`
    this.selectionRect.style.height = `${height}px`

    // Find blocks that intersect with selection rectangle
    this.updateAreaHighlightedBlocks({ left, top, width, height })
  }

  private updateAreaHighlightedBlocks(selectRect: { left: number; top: number; width: number; height: number }) {
    // Guard against view being destroyed or in invalid state
    if (!this.view || !this.view.dom || !this.view.state) {
      return
    }

    const { doc } = this.view.state
    const newHighlighted = new Set<number>()

    const selectBottom = selectRect.top + selectRect.height
    const selectRight = selectRect.left + selectRect.width

    try {
      doc.forEach((node, offset) => {
        try {
          const dom = this.view.nodeDOM(offset)
          if (!dom || !(dom instanceof HTMLElement)) return

          const rect = dom.getBoundingClientRect()

          // Check if block intersects with selection rectangle
          const intersects =
            rect.left < selectRight &&
            rect.right > selectRect.left &&
            rect.top < selectBottom &&
            rect.bottom > selectRect.top

          if (intersects) {
            newHighlighted.add(offset)
          }
        } catch {
          // nodeDOM can throw if view is in invalid state
        }
      })
    } catch {
      return
    }

    // Check if selection changed
    const currentPositions = Array.from(this.areaHighlightedBlocks).sort((a, b) => a - b)
    const newPositions = Array.from(newHighlighted).sort((a, b) => a - b)
    const changed = currentPositions.length !== newPositions.length ||
      currentPositions.some((pos, i) => pos !== newPositions[i])

    if (changed) {
      // Update plugin state to trigger decorations (this makes highlighting survive ProseMirror re-renders)
      const tr = this.view.state.tr.setMeta(multiBlockSelectionKey, {
        selectedBlocks: newPositions,
        anchorBlock: newPositions[0] || null
      })
      tr.setMeta("multiBlockKeep", true)
      tr.setMeta("areaSelecting", true) // Flag to indicate we're in area selection mode
      this.view.dispatch(tr)
    }

    this.areaHighlightedBlocks = newHighlighted
  }

  private onAreaSelectEnd = (_e: MouseEvent) => {
    // Always clean up listeners first, even if not area selecting
    document.removeEventListener("mousemove", this.onAreaSelectMove)
    document.removeEventListener("mouseup", this.onAreaSelectEnd)

    if (!this.isAreaSelecting) return

    // Remove selection rectangle
    if (this.selectionRect) {
      this.selectionRect.remove()
      this.selectionRect = null
    }

    // Reset state BEFORE any dispatch to prevent re-entry issues
    this.isAreaSelecting = false
    this.areaSelectStart = null
    const hadBlocks = this.areaHighlightedBlocks.size > 0
    this.areaHighlightedBlocks.clear()

    // Guard: only dispatch if view is valid
    try {
      if (!hadBlocks && this.view && this.view.state && this.view.dom) {
        const tr = this.view.state.tr.setMeta(multiBlockSelectionKey, {
          selectedBlocks: [],
          anchorBlock: null
        })
        this.view.dispatch(tr)
      }
    } catch {
      // View might be in invalid state, ignore
    }

    // A click normally follows mouseup and is intercepted by onWrapperClick. If
    // mouseup happened outside the wrapper, clear the guard on the next task so
    // it cannot swallow a later, unrelated click.
    if (this.suppressWrapperClick) {
      setTimeout(() => { this.suppressWrapperClick = false }, 0)
    }
  }

  private onWrapperClick = (event: MouseEvent) => {
    if (!this.suppressWrapperClick) return
    this.suppressWrapperClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  private positionHandle() {
    if (this.hoveredBlock === null) return
    const dom = this.view.nodeDOM(this.hoveredBlock.pos)
    if (!dom || !(dom instanceof HTMLElement)) { this.hideHandle(); return }
    if (
      dom.classList.contains("pm-section-collapsed") ||
      getComputedStyle(dom).display === "none"
    ) {
      this.hideHandle()
      return
    }

    const rect = dom.getBoundingClientRect()
    this.hoveredBlockRect = rect

    if (this.scrollParent) {
      const parentRect = this.scrollParent.getBoundingClientRect()
      if (rect.bottom < parentRect.top || rect.top > parentRect.bottom) {
        this.handle.style.display = "none"
        this.addButton.style.display = "none"
        return
      }
    }

    const wrapperRect = this.getEditorWrapper()?.getBoundingClientRect()
    const editorRect = this.view.dom.getBoundingClientRect()
    this.handle.style.display = "flex"
    this.addButton.style.display = "flex"
    // Keep every block handle on one stable gutter axis. Indentation changes
    // the block content, but it must not move the affordance used to grab it.
    this.handle.style.left = `${editorRect.left - (wrapperRect?.left ?? 0) - HANDLE_OFFSET}px`
    this.handle.style.top = `${rect.top - (wrapperRect?.top ?? 0) + 2}px`
    this.addButton.style.left = `${editorRect.left - (wrapperRect?.left ?? 0) - ADD_BUTTON_OFFSET}px`
    this.addButton.style.top = `${rect.top - (wrapperRect?.top ?? 0) + 2}px`
  }

  private hideHandle() {
    this.hoveredBlock = null
    this.hoveredBlockRect = null
    this.handle.style.display = "none"
    this.addButton.style.display = "none"
    this.handle.style.background = "transparent"
    this.addButton.style.background = "transparent"
  }

  // ── Handle click / context menu ──

  private onHandleMouseDown = (e: MouseEvent) => {
    e.stopPropagation()
    // Do NOT call e.preventDefault() here — it would cancel HTML5 drag gestures in Chromium.
    // Instead, use setTimeout to return focus to the editor after the browser's default
    // focus-to-button action completes (so Delete/Backspace still work after handle click).
    if (this.hoveredBlock === null) return

    if (e.button === 0) {
      const block = this.hoveredBlock

      // All blocks support multi-block selection
      const pluginState = multiBlockSelectionKey.getState(this.view.state)
      const isInCurrentSelection = pluginState &&
        pluginState.selectedBlocks &&
        pluginState.selectedBlocks.length > 1 &&
        pluginState.selectedBlocks.includes(block.pos)

      if (isInCurrentSelection) {
        // Block is part of current multi-selection - preserve selection
        // Just focus without changing selection (allows dragging multi-selection)
      } else if (e.shiftKey) {
        selectBlock(this.view, block.pos, "shift")
      } else if (e.metaKey || e.ctrlKey) {
        selectBlock(this.view, block.pos, "toggle")
      } else {
        // Select and decorate the block in the same transaction. A second
        // selection-only transaction would immediately clear the decoration.
        const node = this.view.state.doc.nodeAt(block.pos)
        if (node) {
          const tr = this.view.state.tr
            .setSelection(NodeSelection.create(this.view.state.doc, block.pos))
            .setMeta(multiBlockSelectionKey, {
              selectedBlocks: [block.pos],
              anchorBlock: block.pos
            })
            .setMeta("multiBlockKeep", true)
          this.view.dispatch(tr)
        }
      }
      // Return focus to editor after the browser's default action (focusing the button)
      setTimeout(() => this.view.focus(), 0)
    }
  }

  private onHandleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (this.hoveredBlock === null) return
    this.menuBlock = this.hoveredBlock
    this.showContextMenu(e.clientX, e.clientY, this.hoveredBlock)
  }

  private onAddButtonClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (this.hoveredBlock === null) return
    this.addBlockAfter(this.hoveredBlock.pos)
    this.hideHandle()
  }

  // ── Context Menu ──

  private showContextMenu(x: number, y: number, block: HandledBlock) {
    this.closeContextMenu()
    this.menuBlock = block

    const menu = document.createElement("div")
    menu.className = "block-context-menu"

    // Actions list (rebuilt on filter)
    const actionsContainer = document.createElement("div")
    menu.appendChild(actionsContainer)

    // Separator, label, search, types — only for top-level blocks
    const sep = document.createElement("div")
    sep.className = "block-context-menu-separator"

    const label = document.createElement("div")
    label.className = "block-context-menu-label"
    label.textContent = "Change type"

    const input = document.createElement("input")
    input.type = "text"
    input.className = "block-type-search"
    input.placeholder = "Search blocks…"

    const typesContainer = document.createElement("div")

    menu.appendChild(sep)
    menu.appendChild(label)
    menu.appendChild(input)
    menu.appendChild(typesContainer)

    // Store the list container as the menu itself for keyboard nav
    this.listContainer = menu

    document.body.appendChild(menu)
    this.contextMenu = menu

    // Build and render items
    this.activeItemIndex = 0
    this.renderMenuItems(actionsContainer, typesContainer, sep, block, "")

    input.addEventListener("input", () => {
      this.activeItemIndex = 0
      this.renderMenuItems(actionsContainer, typesContainer, sep, block, input.value.toLowerCase())
    })

    // Position
    const menuRect = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y
    if (left + menuRect.width > vw) left = vw - menuRect.width - 8
    if (top + menuRect.height > vh) top = vh - menuRect.height - 8
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`

    document.addEventListener("keydown", this.onMenuKeyDown)

    // Focus the search input
    requestAnimationFrame(() => input.focus())
  }

  private renderMenuItems(actionsContainer: HTMLElement, typesContainer: HTMLElement, sep: HTMLElement, block: HandledBlock, query: string) {
    actionsContainer.innerHTML = ""
    typesContainer.innerHTML = ""
    this.filteredItems = []

    const actions = [
      { label: "Add before", icon: PLUS_SVG, shortcut: "", destructive: false, action: "addBefore" },
      { label: "Add after", icon: PLUS_SVG, shortcut: "", destructive: false, action: "addAfter" },
      { label: "Duplicate", icon: COPY_SVG, shortcut: "⌘D", destructive: false, action: "duplicate" },
      { label: "Delete", icon: TRASH_SVG, shortcut: "Del", destructive: true, action: "delete" },
    ]

    const matchingActions = actions.filter(a => !query || a.label.toLowerCase().includes(query))
    sep.style.display = matchingActions.length > 0 ? "" : "none"
    if (matchingActions.length > 0) {
      matchingActions.forEach((action, _) => {
        const idx = actions.indexOf(action)
        this.filteredItems.push({ kind: "action", index: idx })
        const el = this.createMenuItemEl(action.icon, action.label, action.shortcut)
        if (action.destructive) el.classList.add("destructive")
        const itemIdx = this.filteredItems.length - 1
        if (itemIdx === this.activeItemIndex) el.classList.add("active")
        el.addEventListener("click", (e) => {
          e.stopPropagation()
          this.executeAction(action.action, block)
          this.closeContextMenu()
        })
        el.addEventListener("mouseenter", () => {
          this.activeItemIndex = itemIdx
          this.updateActiveItems(this.listContainer!)
        })
        actionsContainer.appendChild(el)
      })
    }

    // Block type options
    const matchingTypes = BLOCK_TYPE_OPTIONS.filter(o => !query || o.label.toLowerCase().includes(query))
    matchingTypes.forEach((opt) => {
      const typeIdx = BLOCK_TYPE_OPTIONS.indexOf(opt)
      this.filteredItems.push({ kind: "type", index: typeIdx })
      const el = this.createMenuItemEl(opt.icon, opt.label, "")
      const itemIdx = this.filteredItems.length - 1
      if (itemIdx === this.activeItemIndex) el.classList.add("active")
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        this.changeBlockType(block.pos, opt)
        this.closeContextMenu()
      })
      el.addEventListener("mouseenter", () => {
        this.activeItemIndex = itemIdx
        this.updateActiveItems(this.listContainer!)
      })
      typesContainer.appendChild(el)
    })
  }

  private createMenuItemEl(icon: string, label: string, shortcut: string): HTMLElement {
    const el = document.createElement("button")
    el.className = "block-context-menu-item"
    el.innerHTML = `<span class="item-icon">${icon}</span><span class="item-label">${label}</span>${shortcut ? `<span class="shortcut">${shortcut}</span>` : ""}`
    return el
  }

  private updateActiveItems(container: HTMLElement) {
    const items = container.querySelectorAll(".block-context-menu-item")
    let idx = 0
    items.forEach((el) => {
      el.classList.toggle("active", idx === this.activeItemIndex)
      idx++
    })
  }

  private onMenuKeyDown = (e: KeyboardEvent) => {
    if (!this.contextMenu || this.menuBlock === null || !this.listContainer) return

    if (e.key === "Escape") {
      e.preventDefault()
      this.closeContextMenu()
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      this.activeItemIndex = Math.min(this.activeItemIndex + 1, this.filteredItems.length - 1)
      this.updateActiveItems(this.listContainer)
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      this.activeItemIndex = Math.max(this.activeItemIndex - 1, 0)
      this.updateActiveItems(this.listContainer)
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      const item = this.filteredItems[this.activeItemIndex]
      if (!item) return
      if (item.kind === "action") {
        const actions = ["addBefore", "addAfter", "duplicate", "delete"]
        this.executeAction(actions[item.index], this.menuBlock)
      } else {
        this.changeBlockType(this.menuBlock.pos, BLOCK_TYPE_OPTIONS[item.index])
      }
      this.closeContextMenu()
      return
    }

    // Hotkeys
    if (e.key === "Delete" || (e.key === "Backspace" && !this.contextMenu.querySelector("input:focus"))) {
      e.preventDefault()
      this.executeAction("delete", this.menuBlock)
      this.closeContextMenu()
      return
    }
    if (e.key === "d" && e.metaKey) {
      e.preventDefault()
      this.executeAction("duplicate", this.menuBlock)
      this.closeContextMenu()
      return
    }
  }

  private closeContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.remove()
      this.contextMenu = null
    }
    this.listContainer = null
    this.menuBlock = null
    document.removeEventListener("keydown", this.onMenuKeyDown)
  }

  // ── Block operations (top-level) ──

  private deleteBlock(blockPos: number) {
    const { state, dispatch } = this.view
    const node = state.doc.nodeAt(blockPos)
    if (!node) return

    if (state.doc.childCount === 1) {
      const tr = state.tr.replaceWith(blockPos, blockPos + node.nodeSize, state.schema.nodes.paragraph.create())
      dispatch(tr)
    } else {
      const tr = state.tr.delete(blockPos, blockPos + node.nodeSize)
      dispatch(tr)
    }
    this.view.focus()
  }

  private duplicateBlock(blockPos: number) {
    const { state, dispatch } = this.view
    const node = state.doc.nodeAt(blockPos)
    if (!node) return

    const insertPos = blockPos + node.nodeSize
    const tr = state.tr.insert(insertPos, node.copy(node.content))
    tr.setSelection(NodeSelection.create(tr.doc, insertPos))
    dispatch(tr)
    this.view.focus()
  }

  private addBlockBefore(blockPos: number) {
    const { state, dispatch } = this.view
    const schema = state.schema
    const newParagraph = schema.nodes.paragraph.create()

    let tr = state.tr.insert(blockPos, newParagraph)
    tr = tr.setSelection(TextSelection.create(tr.doc, blockPos + 1))
    dispatch(tr)
    this.view.focus()
  }

  private addBlockAfter(blockPos: number) {
    const { state, dispatch } = this.view
    const node = state.doc.nodeAt(blockPos)
    if (!node) return

    const schema = state.schema
    const newParagraph = schema.nodes.paragraph.create()
    const insertPos = blockPos + node.nodeSize

    let tr = state.tr.insert(insertPos, newParagraph)
    tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
    dispatch(tr)
    this.view.focus()
  }

  // ── Action dispatch ──

  private executeAction(action: string, block: HandledBlock) {
    // For multi-block selection
    const pluginState = multiBlockSelectionKey.getState(this.view.state)
    if (pluginState && pluginState.selectedBlocks.length > 1) {
      if (action === "delete") {
        deleteSelectedBlocks(this.view)
        return
      }
      if (action === "duplicate") {
        duplicateSelectedBlocks(this.view)
        return
      }
    }

    switch (action) {
      case "addBefore": this.addBlockBefore(block.pos); break
      case "addAfter": this.addBlockAfter(block.pos); break
      case "duplicate": this.duplicateBlock(block.pos); break
      case "delete": this.deleteBlock(block.pos); break
    }
  }

  private changeBlockType(blockPos: number, opt: BlockTypeOption) {
    // Check for multi-block selection
    const pluginState = multiBlockSelectionKey.getState(this.view.state)
    if (pluginState && pluginState.selectedBlocks.length > 1) {
      this.changeSelectedBlocksType(pluginState.selectedBlocks, opt)
      return
    }

    const { state, dispatch } = this.view
    const node = state.doc.nodeAt(blockPos)
    if (!node) return

    const schema = state.schema
    // Use node.content (preserves inline marks) for text-based blocks;
    // fall back to plain text for structured/leaf nodes
    const inlineContent = node.content.size > 0 ? node.content : null
    const textContent = node.textContent

    let tr = state.tr

    if (opt.type === "paragraph") {
      const newNode = schema.nodes.paragraph.create(null, inlineContent)
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "heading") {
      const newNode = schema.nodes.heading.create(opt.attrs, inlineContent)
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "code_block") {
      // Code blocks don't support marks — use plain text
      const newNode = schema.nodes.code_block.create(null, textContent ? schema.text(textContent) : null)
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "blockquote") {
      const para = schema.nodes.paragraph.create(null, inlineContent)
      const newNode = schema.nodes.blockquote.create(null, para)
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "bullet_item") {
      const newNode = schema.nodes.bullet_item.create({ indent: 0 }, inlineContent)
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "numbered_item") {
      const newNode = schema.nodes.numbered_item.create({ indent: 0 }, inlineContent)
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "task_item") {
      const newNode = schema.nodes.task_item.create({ indent: 0, checked: false }, inlineContent)
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "table") {
      const cell = schema.nodes.table_cell.create(null, textContent ? schema.text(textContent) : schema.text(" "))
      const emptyCell = schema.nodes.table_cell.create(null, schema.text(" "))
      const headerCell = schema.nodes.table_header.create(null, textContent ? schema.text(textContent) : schema.text(" "))
      const emptyHeader = schema.nodes.table_header.create(null, schema.text(" "))
      const headerRow = schema.nodes.table_row.create(null, [headerCell, emptyHeader, emptyHeader.copy(emptyHeader.content)])
      const dataRow = schema.nodes.table_row.create(null, [emptyCell, emptyCell.copy(emptyCell.content), emptyCell.copy(emptyCell.content)])
      const newNode = schema.nodes.table.create(null, [headerRow, dataRow, dataRow.copy(dataRow.content)])
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "mermaid") {
      const defaultCode = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Result 1]
    B -->|No| D[Result 2]`
      const newNode = schema.nodes.mermaid.create({ code: defaultCode, mode: "split" })
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    } else if (opt.type === "horizontal_rule") {
      const newNode = schema.nodes.horizontal_rule.create()
      tr = tr.replaceWith(blockPos, blockPos + node.nodeSize, newNode)
    }

    dispatch(tr)
    this.view.focus()
  }

  private changeSelectedBlocksType(positions: number[], opt: BlockTypeOption) {
    const { state, dispatch } = this.view
    const schema = state.schema
    let tr = state.tr

    // Sort positions in reverse order to change from end to start (preserves positions)
    const sorted = [...positions].sort((a, b) => b - a)

    for (const blockPos of sorted) {
      const mappedPos = tr.mapping.map(blockPos)
      const node = tr.doc.nodeAt(mappedPos)
      if (!node) continue

      const inlineContent = node.content.size > 0 ? node.content : null
      const textContent = node.textContent
      let newNode

      if (opt.type === "paragraph") {
        newNode = schema.nodes.paragraph.create(null, inlineContent)
      } else if (opt.type === "heading") {
        newNode = schema.nodes.heading.create(opt.attrs, inlineContent)
      } else if (opt.type === "code_block") {
        newNode = schema.nodes.code_block.create(null, textContent ? schema.text(textContent) : null)
      } else if (opt.type === "blockquote") {
        const para = schema.nodes.paragraph.create(null, inlineContent)
        newNode = schema.nodes.blockquote.create(null, para)
      } else if (opt.type === "bullet_item") {
        newNode = schema.nodes.bullet_item.create({ indent: 0 }, inlineContent)
      } else if (opt.type === "numbered_item") {
        newNode = schema.nodes.numbered_item.create({ indent: 0 }, inlineContent)
      } else if (opt.type === "task_item") {
        newNode = schema.nodes.task_item.create({ indent: 0, checked: false }, inlineContent)
      } else if (opt.type === "table") {
        const cell = schema.nodes.table_cell.create(null, textContent ? schema.text(textContent) : schema.text(" "))
        const emptyCell = schema.nodes.table_cell.create(null, schema.text(" "))
        const headerCell = schema.nodes.table_header.create(null, textContent ? schema.text(textContent) : schema.text(" "))
        const emptyHeader = schema.nodes.table_header.create(null, schema.text(" "))
        const headerRow = schema.nodes.table_row.create(null, [headerCell, emptyHeader, emptyHeader.copy(emptyHeader.content)])
        const dataRow = schema.nodes.table_row.create(null, [emptyCell, emptyCell.copy(emptyCell.content), emptyCell.copy(emptyCell.content)])
        newNode = schema.nodes.table.create(null, [headerRow, dataRow, dataRow.copy(dataRow.content)])
      } else if (opt.type === "mermaid") {
        const defaultCode = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Result 1]
    B -->|No| D[Result 2]`
        newNode = schema.nodes.mermaid.create({ code: defaultCode, mode: "split" })
      } else if (opt.type === "horizontal_rule") {
        newNode = schema.nodes.horizontal_rule.create()
      }

      if (newNode) {
        tr = tr.replaceWith(mappedPos, mappedPos + node.nodeSize, newNode)
      }
    }

    // Clear multi-block selection after changing types
    tr.setMeta(multiBlockSelectionKey, { selectedBlocks: [], anchorBlock: null })
    dispatch(tr)
    this.view.focus()
  }

  // ── Drag and Drop ──

  private draggedMultiBlocks: number[] | null = null

  // Start drag from handle (uses hoveredBlock)
  private onDragStart = (e: DragEvent) => {
    this.closeContextMenu()
    if (this.hoveredBlock === null || !e.dataTransfer) return
    this.startDrag(e, this.hoveredBlock)
  }

  // Start drag from a specific block position (called for direct block drags)
  public startDragFromBlock(e: DragEvent, blockPos: number): boolean {
    const node = this.view.state.doc.nodeAt(blockPos)
    if (!node || !e.dataTransfer) return false

    const $pos = this.view.state.doc.resolve(blockPos)
    const block: HandledBlock = {
      pos: blockPos,
      node,
      depth: $pos.depth,
      isNested: $pos.depth > 1
    }
    this.startDrag(e, block)
    return true
  }

  // Common drag start logic
  private startDrag(e: DragEvent, block: HandledBlock) {
    if (!e.dataTransfer) return

    this.draggedBlock = block
    this.menuBlock = null
    this.draggedMultiBlocks = null

    // Check if dragging a block that's part of a multi-selection
    const pluginState = multiBlockSelectionKey.getState(this.view.state)
    if (pluginState && pluginState.selectedBlocks.length > 1 &&
        pluginState.selectedBlocks.includes(block.pos)) {
      this.draggedMultiBlocks = [...pluginState.selectedBlocks].sort((a, b) => a - b)
    }

    // If dragging a collapsed heading, grab the entire section with it
    if (!this.draggedMultiBlocks) {
      const colState = collapsibleHeadingsKey.getState(this.view.state)
      if (block.node.type.name === "heading" && colState?.collapsed.has(block.pos)) {
        const sectionEnd = findSectionEnd(this.view.state.doc, block.pos, block.node.attrs.level)
        const positions: number[] = []
        let pos = block.pos
        while (pos < sectionEnd) {
          const n = this.view.state.doc.nodeAt(pos)
          if (!n) break
          positions.push(pos)
          pos += n.nodeSize
        }
        if (positions.length > 1) {
          this.draggedMultiBlocks = positions
        }
      }
    }

    const node = this.view.state.doc.nodeAt(block.pos)
    if (!node) return

    const dom = this.view.nodeDOM(block.pos)
    if (dom && dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect()
      this.draggedBlockX = rect.left
      const ghost = dom.cloneNode(true) as HTMLElement
      ghost.className = "block-drag-ghost"
      ghost.style.width = `${rect.width}px`
      ghost.style.left = `${rect.left}px`
      ghost.style.top = `${rect.top}px`

      if (this.draggedMultiBlocks && this.draggedMultiBlocks.length > 1) {
        // Add a badge showing count of blocks being dragged
        const badge = document.createElement("div")
        badge.style.cssText = `position:absolute;top:4px;right:4px;background:hsl(222.2,47.4%,41.2%);color:white;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:600;`
        badge.textContent = String(this.draggedMultiBlocks.length)
        ghost.style.position = "relative"
        ghost.appendChild(badge)
      }

      document.body.appendChild(ghost)
      this.dragGhost = ghost

      const blank = document.createElement("div")
      blank.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;"
      document.body.appendChild(blank)
      e.dataTransfer.setDragImage(blank, 0, 0)
      requestAnimationFrame(() => blank.remove())
    }

    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("application/x-block-drag", String(block.pos))
    this.handle.style.cursor = "grabbing"
    this.addButton.style.display = "none"

    document.addEventListener("dragover", this.onDragOver)
    document.addEventListener("drop", this.onDrop)
  }

  private onDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (!e.dataTransfer) return
    e.dataTransfer.dropEffect = "move"

    if (this.dragGhost) {
      const wrapperRect = this.getEditorWrapper()?.getBoundingClientRect()
      const editorRect = this.view.dom.getBoundingClientRect()
      this.dragGhost.style.top = `${e.clientY - 12}px`
      this.dragGhost.style.left = `${this.draggedBlockX}px`
      this.handle.style.display = "flex"
      this.handle.style.top = `${e.clientY - (wrapperRect?.top ?? 0) - 12 + 2}px`
      this.handle.style.left = `${editorRect.left - (wrapperRect?.left ?? 0) - HANDLE_OFFSET}px`
    }

    const target = this.getDropTarget(e.clientY)
    if (!target) {
      this.dropIndicator.style.display = "none"
      this.headingHighlight.style.display = "none"
      return
    }

    // Calculate target indent based on X position (only for list items)
    this.targetIndent = 0
    if (this.draggedBlock) {
      const nodeType = this.draggedBlock.node.type.name
      const isListItem = nodeType === "bullet_item" || nodeType === "numbered_item" || nodeType === "task_item"

      if (isListItem) {
        const editorRect = this.view.dom.getBoundingClientRect()
        const previousBlock = this.getPreviousListBlockGeometry(target.insertPos)
        this.targetIndent = listDropIndent({
          pointerX: e.clientX,
          editorLeft: editorRect.left,
          editorWidth: editorRect.width,
          targetBlockLeft: previousBlock?.left ?? editorRect.left,
          targetBlockWidth: previousBlock?.width ?? editorRect.width,
          targetBlockIndent: previousBlock?.indent ?? -1,
          maxIndent: this.MAX_INDENT
        })

        // If same position, only show indicator if indent would change
        if (target.isSamePosition) {
          const currentIndent = this.draggedBlock.node.attrs.indent || 0
          if (this.targetIndent === currentIndent) {
            this.dropIndicator.style.display = "none"
            this.headingHighlight.style.display = "none"
            return
          }
        }
      }
    }

    this.showDropIndicator(target)
  }

  private getDropTarget(clientY: number): { insertPos: number; y: number; isSamePosition?: boolean; isHeadingAppend?: boolean; headingPos?: number } | null {
    // First check if we're hovering over a collapsed heading
    const headingTarget = this.getCollapsedHeadingDropTarget(clientY)
    if (headingTarget) return headingTarget

    // Otherwise check for top-level drop targets
    return this.getTopLevelDropTarget(clientY)
  }

  // Check if dragging over a collapsed heading (drop to append after section end)
  private getCollapsedHeadingDropTarget(clientY: number): { insertPos: number; y: number; isHeadingAppend: boolean; headingPos: number } | null {
    const { doc } = this.view.state
    const colState = collapsibleHeadingsKey.getState(this.view.state)
    if (!colState || colState.collapsed.size === 0) return null

    let result: { insertPos: number; y: number; isHeadingAppend: boolean; headingPos: number } | null = null

    doc.forEach((node, offset) => {
      if (result) return
      if (node.type.name !== "heading") return
      if (!colState.collapsed.has(offset)) return

      const dom = this.view.nodeDOM(offset)
      if (!dom || !(dom instanceof HTMLElement)) return
      const rect = dom.getBoundingClientRect()

      if (clientY >= rect.top && clientY <= rect.bottom) {
        const sectionEnd = findSectionEnd(doc, offset, node.attrs.level)
        result = {
          insertPos: sectionEnd,
          y: rect.top + rect.height / 2,
          isHeadingAppend: true,
          headingPos: offset
        }
      }
    })

    return result
  }

  // The block directly above the drop gap defines alignment and the next
  // target-relative indentation threshold.
  private getPreviousListBlockGeometry(insertPos: number): { indent: number; left: number; width: number } | null {
    const doc = this.view.state.doc
    let previous: { indent: number; left: number; width: number } | null = null

    // Find the block that ends at or before insertPos
    doc.forEach((node, offset) => {
      const nodeEnd = offset + node.nodeSize
      if (nodeEnd <= insertPos) {
        const typeName = node.type.name
        if (typeName === "bullet_item" || typeName === "numbered_item" || typeName === "task_item") {
          const dom = this.view.nodeDOM(offset)
          if (dom instanceof HTMLElement) {
            const rect = dom.getBoundingClientRect()
            previous = {
              indent: node.attrs.indent || 0,
              left: rect.left,
              width: rect.width
            }
          } else {
            previous = null
          }
        } else {
          previous = null
        }
      }
    })

    return previous
  }

  private getTopLevelDropTarget(clientY: number): { insertPos: number; y: number; isSamePosition?: boolean } | null {
    const doc = this.view.state.doc
    const gaps: { insertPos: number; y: number }[] = []

    let prevBottom: number | null = null
    doc.forEach((node, offset) => {
      const dom = this.view.nodeDOM(offset)
      if (!dom || !(dom instanceof HTMLElement)) return
      const rect = dom.getBoundingClientRect()

      if (prevBottom === null) {
        gaps.push({ insertPos: offset, y: rect.top })
      } else {
        gaps.push({ insertPos: offset, y: (prevBottom + rect.top) / 2 })
      }
      prevBottom = rect.bottom
      gaps.push({ insertPos: offset + node.nodeSize, y: rect.bottom })
    })

    const seen = new Set<number>()
    const uniqueGaps = gaps.filter(g => {
      if (seen.has(g.insertPos)) return false
      seen.add(g.insertPos)
      return true
    })

    let closest: { insertPos: number; y: number; dist: number } | null = null
    for (const gap of uniqueGaps) {
      const dist = Math.abs(clientY - gap.y)
      if (!closest || dist < closest.dist) {
        closest = { ...gap, dist }
      }
    }

    if (!closest) return null

    // Check if dropping at same position (for list items, we allow this if indent changes)
    if (this.draggedBlock !== null) {
      const draggedNode = doc.nodeAt(this.draggedBlock.pos)
      if (draggedNode) {
        const dragEnd = this.draggedBlock.pos + draggedNode.nodeSize
        if (closest.insertPos === this.draggedBlock.pos || closest.insertPos === dragEnd) {
          // For list items, return target with flag so we can check indent later
          const nodeType = this.draggedBlock.node.type.name
          const isListItem = nodeType === "bullet_item" || nodeType === "numbered_item" || nodeType === "task_item"
          if (isListItem) {
            return { insertPos: closest.insertPos, y: closest.y, isSamePosition: true }
          }
          return null
        }
      }
    }

    return closest
  }

  private showDropIndicator(target: { insertPos: number; y: number; isHeadingAppend?: boolean; headingPos?: number }) {
    // If dropping onto a collapsed heading, highlight the heading row
    if (target.isHeadingAppend && target.headingPos !== undefined) {
      this.dropIndicator.style.display = "none"
      const headingDom = this.view.nodeDOM(target.headingPos)
      if (headingDom && headingDom instanceof HTMLElement) {
        const rect = headingDom.getBoundingClientRect()
        this.headingHighlight.style.display = "block"
        this.headingHighlight.style.top = `${rect.top}px`
        this.headingHighlight.style.left = `${rect.left}px`
        this.headingHighlight.style.width = `${rect.width}px`
        this.headingHighlight.style.height = `${rect.height}px`
        this.headingHighlight.dataset.dropPos = String(target.insertPos)
        this.headingHighlight.dataset.targetIndent = "0"
      }
      return
    }

    // Otherwise show line indicator
    this.headingHighlight.style.display = "none"
    const editorRect = this.view.dom.getBoundingClientRect()
    this.dropIndicator.style.display = "block"
    this.dropIndicator.style.top = `${target.y - 1}px`
    this.dropIndicator.dataset.dropPos = String(target.insertPos)
    this.dropIndicator.dataset.targetIndent = String(this.targetIndent)

    const indentOffset = this.targetIndent * this.INDENT_MARGIN_PX
    this.dropIndicator.style.left = `${editorRect.left + indentOffset}px`
    this.dropIndicator.style.width = `${editorRect.width - indentOffset}px`
  }

  private onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Check which indicator is visible to get the correct drop position
    // (must check visibility, not just dataset, to avoid using stale values from previous hover)
    const isHeadingHighlight = this.headingHighlight.style.display !== "none"
    const dropPosStr = isHeadingHighlight ? this.headingHighlight.dataset.dropPos : this.dropIndicator.dataset.dropPos
    const targetIndentStr = this.dropIndicator.dataset.targetIndent || this.headingHighlight.dataset.targetIndent
    const draggedBlock = this.draggedBlock
    const multiBlocks = this.draggedMultiBlocks
    const targetIndent = targetIndentStr ? parseInt(targetIndentStr, 10) : 0
    this.cleanupDrag()

    if (draggedBlock === null || !dropPosStr) return

    const dropPos = parseInt(dropPosStr, 10)
    const { state, dispatch } = this.view

    // Multi-block drag
    if (multiBlocks && multiBlocks.length > 1) {
      const primaryOriginalIndent = draggedBlock ? (draggedBlock.node.attrs.indent ?? 0) : 0
      this.dropMultiBlocks(state, dispatch, multiBlocks, dropPos, targetIndent, primaryOriginalIndent)
      return
    }

    // Single block drag
    const draggedPos = draggedBlock.pos
    const node = state.doc.nodeAt(draggedPos)
    if (!node) return

    const nodeSize = node.nodeSize

    // Check if this is a list item that needs indent change
    const isListItem = node.type.name === "bullet_item" || node.type.name === "numbered_item" || node.type.name === "task_item"
    const needsIndentChange = isListItem && targetIndent !== (node.attrs.indent || 0)

    // Only skip if same position AND no indent change needed
    if (dropPos >= draggedPos && dropPos <= draggedPos + nodeSize) {
      if (!needsIndentChange) return
      // Same position but indent changes - continue to apply indent change
    }

    let tr = state.tr

    // Check if this is an in-place indent change (not moving position)
    const isSamePosition = dropPos >= draggedPos && dropPos <= draggedPos + nodeSize

    if (needsIndentChange && isSamePosition) {
      // In-place indent change - just update the node attributes
      const newAttrs = { ...node.attrs, indent: targetIndent }
      tr = tr.setNodeMarkup(draggedPos, null, newAttrs)
    } else if (needsIndentChange) {
      // Moving position AND changing indent
      const newAttrs = { ...node.attrs, indent: targetIndent }
      const newNode = node.type.create(newAttrs, node.content, node.marks)

      if (dropPos > draggedPos) {
        tr = tr.insert(dropPos, newNode)
        tr = tr.delete(draggedPos, draggedPos + nodeSize)
      } else {
        tr = tr.delete(draggedPos, draggedPos + nodeSize)
        tr = tr.insert(dropPos, newNode)
      }
    } else {
      // No indent change, just moving position
      if (dropPos > draggedPos) {
        const slice = state.doc.slice(draggedPos, draggedPos + nodeSize)
        tr = tr.insert(dropPos, slice.content)
        tr = tr.delete(draggedPos, draggedPos + nodeSize)
      } else {
        const slice = state.doc.slice(draggedPos, draggedPos + nodeSize)
        tr = tr.delete(draggedPos, draggedPos + nodeSize)
        tr = tr.insert(dropPos, slice.content)
      }
    }

    // For in-place indent changes, keep the same position; otherwise calculate new position
    const newPos = isSamePosition ? draggedPos : (dropPos > draggedPos ? dropPos - nodeSize : dropPos)
    tr = tr.setSelection(NodeSelection.create(tr.doc, newPos))
    tr.setMeta(multiBlockSelectionKey, { selectedBlocks: [], anchorBlock: null })

    // Preserve collapsed heading state through the move
    const colState = collapsibleHeadingsKey.getState(state)
    if (colState && colState.collapsed.size > 0) {
      const newCollapsed = new Set<number>()
      for (const pos of colState.collapsed) {
        const remapped = pos === draggedPos ? newPos : tr.mapping.map(pos)
        const n = tr.doc.nodeAt(remapped)
        if (n && n.type.name === "heading") newCollapsed.add(remapped)
      }
      tr.setMeta(collapsibleHeadingsKey, { collapsed: newCollapsed })
    }

    dispatch(tr)
  }

  private dropMultiBlocks(state: typeof this.view.state, dispatch: typeof this.view.dispatch, positions: number[], dropPos: number, targetIndent: number = 0, primaryOriginalIndent: number = 0) {
    // Collect all selected block nodes with their info
    const blocks: { pos: number; size: number; node: PmNode }[] = []
    for (const pos of positions) {
      const node = state.doc.nodeAt(pos)
      if (!node) continue
      blocks.push({ pos, size: node.nodeSize, node })
    }

    if (blocks.length === 0) return

    // Check if drop position is inside any selected block
    for (const b of blocks) {
      if (dropPos >= b.pos && dropPos <= b.pos + b.size) return
    }

    let tr = state.tr

    // Delete all selected blocks in reverse order
    const reversed = [...blocks].reverse()
    for (const b of reversed) {
      const mappedPos = tr.mapping.map(b.pos)
      const node = tr.doc.nodeAt(mappedPos)
      if (!node) continue
      tr = tr.delete(mappedPos, mappedPos + node.nodeSize)
    }

    // Insert all blocks at drop position (mapped), applying indent to list items
    const mappedDrop = tr.mapping.map(dropPos)
    let insertPos = mappedDrop
    const newPositions: number[] = []
    for (const b of blocks) {
      const isListItem = b.node.type.name === "bullet_item" || b.node.type.name === "numbered_item" || b.node.type.name === "task_item"
      let nodeToInsert = b.node

      // Apply indent to list items, preserving relative offsets from the primary block
      if (isListItem) {
        const relativeOffset = (b.node.attrs.indent || 0) - primaryOriginalIndent
        const newIndent = Math.max(0, Math.min(this.MAX_INDENT, targetIndent + relativeOffset))
        if (newIndent !== (b.node.attrs.indent || 0)) {
          const newAttrs = { ...b.node.attrs, indent: newIndent }
          nodeToInsert = b.node.type.create(newAttrs, b.node.content, b.node.marks)
        }
      }

      newPositions.push(insertPos)
      tr = tr.insert(insertPos, nodeToInsert)
      insertPos += nodeToInsert.nodeSize
    }

    // Select the first moved block
    if (newPositions.length > 0) {
      const firstNode = tr.doc.nodeAt(newPositions[0])
      if (firstNode) {
        tr = tr.setSelection(NodeSelection.create(tr.doc, newPositions[0]))
      }
    }

    // Update multi-block selection to new positions
    tr.setMeta(multiBlockSelectionKey, { selectedBlocks: newPositions, anchorBlock: newPositions[0] || null })

    // Preserve collapsed heading state through the move
    const colState = collapsibleHeadingsKey.getState(state)
    if (colState && colState.collapsed.size > 0) {
      const oldPosToNew = new Map(positions.map((oldPos, i) => [oldPos, newPositions[i]]))
      const newCollapsed = new Set<number>()
      for (const pos of colState.collapsed) {
        const remapped = oldPosToNew.has(pos) ? oldPosToNew.get(pos)! : tr.mapping.map(pos)
        const n = tr.doc.nodeAt(remapped)
        if (n && n.type.name === "heading") newCollapsed.add(remapped)
      }
      tr.setMeta(collapsibleHeadingsKey, { collapsed: newCollapsed })
    }

    dispatch(tr)
  }

  private onDragEnd = () => {
    this.cleanupDrag()
  }

  private cleanupDrag() {
    this.dropIndicator.style.display = "none"
    this.headingHighlight.style.display = "none"
    this.handle.style.cursor = "grab"
    this.draggedBlock = null
    this.draggedMultiBlocks = null
    this.targetIndent = 0
    if (this.dragGhost) {
      this.dragGhost.remove()
      this.dragGhost = null
    }
    document.removeEventListener("dragover", this.onDragOver)
    document.removeEventListener("drop", this.onDrop)

    // Clear multi-block selection after drag-n-drop
    const pluginState = multiBlockSelectionKey.getState(this.view.state)
    if (pluginState && pluginState.selectedBlocks && pluginState.selectedBlocks.length > 0) {
      const tr = this.view.state.tr.setMeta(multiBlockSelectionKey, {
        selectedBlocks: [],
        anchorBlock: null
      })
      this.view.dispatch(tr)
    }
  }

  update() {
    if (this.hoveredBlock !== null && this.draggedBlock === null) {
      const node = this.view.state.doc.nodeAt(this.hoveredBlock.pos)
      if (node) {
        this.positionHandle()
      } else {
        this.hideHandle()
      }
    }
  }

  destroy() {
    if (this.mouseMoveRafId !== null) {
      cancelAnimationFrame(this.mouseMoveRafId)
      this.mouseMoveRafId = null
    }
    this.handle.remove()
    this.addButton.remove()
    this.dropIndicator.remove()
    this.headingHighlight.remove()
    this.styleEl.remove()
    this.closeContextMenu()
    if (this.dragGhost) {
      this.dragGhost.remove()
      this.dragGhost = null
    }
    if (this.selectionRect) {
      this.selectionRect.remove()
      this.selectionRect = null
    }
    document.removeEventListener("mousemove", this.onDocMouseMove)
    document.removeEventListener("mousedown", this.onDocMouseDown)
    document.removeEventListener("keydown", this.onDocKeyDown)
    const surface = this.getAreaSelectionSurface()
    if (surface) {
      surface.removeEventListener("mousedown", this.onWrapperMouseDown, true)
      surface.removeEventListener("mousemove", this.onWrapperMouseMove)
      surface.removeEventListener("click", this.onWrapperClick, true)
      surface.style.cursor = ""
    }
    document.removeEventListener("mousemove", this.onAreaSelectMove)
    document.removeEventListener("mouseup", this.onAreaSelectEnd)
    if (this.scrollParent) {
      this.scrollParent.removeEventListener("scroll", this.onScroll)
    }
    document.removeEventListener("dragover", this.onDragOver)
    document.removeEventListener("drop", this.onDrop)
  }
}

export function blockDragHandlePlugin(_schema: Schema) {
  let viewInstance: BlockDragHandleView | null = null

  return new Plugin({
    key: blockDragHandleKey,
    view(editorView) {
      viewInstance = new BlockDragHandleView(editorView)
      return viewInstance
    },
    props: {
      handleDOMEvents: {
        dragstart(view, e) {
          // Check if this is a drag on a selected block (not from our handle)
          const sel = view.state.selection
          if (!(sel instanceof NodeSelection)) return false

          // Get the position of the selected node
          const blockPos = sel.from

          // If we have a view instance, use our custom drag
          if (viewInstance) {
            const handled = viewInstance.startDragFromBlock(e, blockPos)
            if (handled) {
              // Don't prevent default - we need the drag to work
              // But we've set up our custom ghost and listeners
              return false
            }
          }
          return false
        }
      }
    }
  })
}

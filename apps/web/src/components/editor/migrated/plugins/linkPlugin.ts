// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, TextSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema, Mark } from "prosemirror-model"
import { openEditorHref } from "../platform"
import {
  isExternalLinkHref,
  isLinkDestination,
  normalizeLinkHref
} from "../linkHref"
import { linkRangeAtPosition } from "../linkSelection"
import { openSelectionToolbarLinkEditor } from "./selectionToolbar"

export const linkPluginKey = new PluginKey("link")
const COMMAND_LINK_MODE_CLASS = "rumi-command-link-mode"

export function linkPlugin(schema: Schema) {
  if (!schema.marks.link) return new Plugin({ key: linkPluginKey })

  return new Plugin({
    key: linkPluginKey,

    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          const link = closestLink(event.target)
          if (!link) return false

          event.preventDefault()
          openLinkEditorForDomLink(view, link)
          return true
        }
      },

      handleClick(view, pos, event) {
        const link = closestLink(event.target)
        if (!link || event.button !== 0 || isSecondaryContextGesture(event)) return false

        event.preventDefault()
        const href = normalizeLinkHref(link.getAttribute("href") ?? "")
        const intent = linkClickIntent(link, event)

        if (intent === "caret") {
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.near(view.state.doc.resolve(pos)))
              .setMeta("addToHistory", false)
          )
          view.focus()
          return true
        }

        if (href) openEditorHref(href, intent === "new-tab" ? "new" : "current")
        return true
      },

      handlePaste(view, event, slice) {
        const { from, to, empty } = view.state.selection

        // Only apply link if text is selected
        if (empty) return false

        const clipboardText = event.clipboardData?.getData("text/plain")
        if (!clipboardText) return false

        // A URL or workspace path turns the highlighted text into a link.
        if (isLinkDestination(clipboardText)) {
          event.preventDefault()

          const linkMark = schema.marks.link
          const href = normalizeLinkHref(clipboardText)

          // Apply link to selected text
          let tr = view.state.tr.addMark(from, to, linkMark.create({ href }))
          tr = tr.setSelection(TextSelection.create(tr.doc, to))
          view.dispatch(tr)
          return true
        }

        return false
      }
    },

    view(editorView) {
      let showTimeout: ReturnType<typeof setTimeout> | null = null
      let hideTimeout: ReturnType<typeof setTimeout> | null = null
      let currentLinkData: { href: string; from: number; to: number } | null = null
      let isTooltipVisible = false
      let isMouseOverLink = false
      let isMouseOverTooltip = false
      const editorContainer = editorView.dom.closest(".prosemirror-editor") ?? editorView.dom

      const setCommandLinkMode = (active: boolean) => {
        editorContainer.classList.toggle(COMMAND_LINK_MODE_CLASS, active)
      }
      const handleModifierKeyDown = (event: KeyboardEvent) => {
        if (event.metaKey || event.key === "Meta") setCommandLinkMode(true)
      }
      const handleModifierKeyUp = (event: KeyboardEvent) => {
        if (!event.metaKey || event.key === "Meta") setCommandLinkMode(false)
      }
      const handleModifierMouseMove = (event: MouseEvent) => {
        setCommandLinkMode(event.metaKey)
      }
      const clearCommandLinkMode = () => setCommandLinkMode(false)

      // Create tooltip container
      const tooltip = document.createElement("div")
      tooltip.className = "link-hover-tooltip"
      tooltip.style.cssText = `
        position: absolute;
        z-index: 1001;
        background: white;
        border: 1px solid hsl(214.3, 31.8%, 91.4%);
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        padding: 4px;
        display: none;
        gap: 4px;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
      `

      // Copy button
      const copyBtn = document.createElement("button")
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
      copyBtn.title = "Copy link"
      copyBtn.style.cssText = `
        padding: 4px 8px;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        color: hsl(222.2, 84%, 4.9%);
      `
      const copyText = document.createElement("span")
      copyText.textContent = "Copy"
      copyBtn.appendChild(copyText)

      // Edit button
      const editBtn = document.createElement("button")
      editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
      editBtn.title = "Edit link"
      editBtn.style.cssText = copyBtn.style.cssText
      const editText = document.createElement("span")
      editText.textContent = "Edit"
      editBtn.appendChild(editText)

      tooltip.appendChild(copyBtn)
      tooltip.appendChild(editBtn)
      document.body.appendChild(tooltip)

      function showTooltip(linkEl: HTMLElement) {
        const href = linkEl.getAttribute("href") || ""

        // Find link position in document
        const linkMark = schema.marks.link
        let from = 0
        let to = 0

        try {
          const pos = editorView.posAtDOM(linkEl, 0)
          const $pos = editorView.state.doc.resolve(pos)
          const parent = $pos.parent
          const start = $pos.start()

          parent.forEach((node, offset) => {
            const mark = node.marks.find((m: Mark) => m.type === linkMark && m.attrs.href === href)
            if (mark) {
              const nodeFrom = start + offset
              const nodeTo = nodeFrom + node.nodeSize
              if (pos >= nodeFrom && pos <= nodeTo) {
                from = nodeFrom
                to = nodeTo
              }
            }
          })
        } catch (e) {
          return
        }

        currentLinkData = { href, from, to }
        const rect = linkEl.getBoundingClientRect()
        tooltip.style.left = `${rect.left}px`
        tooltip.style.top = `${rect.bottom + 4}px`
        tooltip.style.display = "flex"
        isTooltipVisible = true
      }

      function hideTooltip() {
        tooltip.style.display = "none"
        isTooltipVisible = false
        currentLinkData = null
      }

      function clearTimers() {
        if (showTimeout) {
          clearTimeout(showTimeout)
          showTimeout = null
        }
        if (hideTimeout) {
          clearTimeout(hideTimeout)
          hideTimeout = null
        }
      }

      function scheduleShow(linkEl: HTMLElement) {
        clearTimers()
        // If tooltip is already visible, keep it visible (no delay)
        if (isTooltipVisible) {
          showTooltip(linkEl)
          return
        }
        showTimeout = setTimeout(() => {
          showTooltip(linkEl)
        }, 500)
      }

      function scheduleHide() {
        clearTimers()
        hideTimeout = setTimeout(() => {
          if (!isMouseOverLink && !isMouseOverTooltip) {
            hideTooltip()
          }
        }, 500)
      }

      // Mouse events on editor for link hover
      const handleMouseOver = (e: MouseEvent) => {
        setCommandLinkMode(e.metaKey)
        const target = e.target as HTMLElement
        const link = target.closest("a") as HTMLElement | null

        if (link) {
          isMouseOverLink = true
          scheduleShow(link)
        }
      }

      const handleMouseOut = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const link = target.closest("a")

        if (link) {
          isMouseOverLink = false
          scheduleHide()
        }
      }

      // Mouse events on tooltip
      tooltip.addEventListener("mouseenter", () => {
        isMouseOverTooltip = true
        clearTimers()
      })

      tooltip.addEventListener("mouseleave", () => {
        isMouseOverTooltip = false
        scheduleHide()
      })

      // Button click handlers
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (currentLinkData?.href) {
          navigator.clipboard.writeText(currentLinkData.href)
          // Visual feedback: change to checkmark
          const originalHtml = copyBtn.innerHTML
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span style="color: #22c55e">Copy</span>`
          // Hide after 0.2s
          setTimeout(() => {
            copyBtn.innerHTML = originalHtml
            hideTooltip()
          }, 200)
        }
      })

      editBtn.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (currentLinkData) {
          const linkDataCopy = { ...currentLinkData }
          hideTooltip()
          openLinkEditorAtPosition(editorView, linkDataCopy.from)
        }
      })

      // Click outside to hide instantly (but not if clicking inside tooltip)
      const handleClickOutside = (e: MouseEvent) => {
        // Don't hide if clicking inside tooltip
        if (tooltip.contains(e.target as Node)) {
          return
        }
        clearTimers()
        hideTooltip()
      }

      // Attach event listeners
      const editorDom = editorView.dom
      editorDom.addEventListener("mouseover", handleMouseOver)
      editorDom.addEventListener("mouseout", handleMouseOut)
      editorDom.addEventListener("mousemove", handleModifierMouseMove)
      document.addEventListener("keydown", handleModifierKeyDown, true)
      document.addEventListener("keyup", handleModifierKeyUp, true)
      window.addEventListener("blur", clearCommandLinkMode)
      document.addEventListener("mousedown", handleClickOutside)

      return {
        destroy() {
          clearTimers()
          tooltip.remove()
          clearCommandLinkMode()
          editorDom.removeEventListener("mouseover", handleMouseOver)
          editorDom.removeEventListener("mouseout", handleMouseOut)
          editorDom.removeEventListener("mousemove", handleModifierMouseMove)
          document.removeEventListener("keydown", handleModifierKeyDown, true)
          document.removeEventListener("keyup", handleModifierKeyUp, true)
          window.removeEventListener("blur", clearCommandLinkMode)
          document.removeEventListener("mousedown", handleClickOutside)
        }
      }
    }
  })
}

function closestLink(target: EventTarget | null): Element | null {
  const candidate = target as {
    closest?: (selector: string) => Element | null
    parentElement?: { closest?: (selector: string) => Element | null } | null
  } | null
  if (typeof candidate?.closest === "function") return candidate.closest("a")
  return typeof candidate?.parentElement?.closest === "function"
    ? candidate.parentElement.closest("a")
    : null
}

function isSecondaryContextGesture(event: MouseEvent): boolean {
  return event.button === 2 || (
    /Mac|iP(hone|ad|od)/iu.test(globalThis.navigator?.platform ?? "") &&
    event.button === 0 &&
    event.ctrlKey
  )
}

function openLinkEditorForDomLink(view: EditorView, link: Element): boolean {
  try {
    return openLinkEditorAtPosition(view, view.posAtDOM(link, 0))
  } catch {
    return false
  }
}

function openLinkEditorAtPosition(view: EditorView, position: number): boolean {
  const range = linkRangeAtPosition(view.state, position)
  if (!range) return false

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, range.from))
      .setMeta("addToHistory", false)
  )
  return openSelectionToolbarLinkEditor(view.state, view.dispatch)
}

export type LinkClickIntent = "caret" | "current-tab" | "new-tab"

export function linkClickIntent(link: Element, event: MouseEvent): LinkClickIntent {
  if (event.metaKey) {
    return isExternalLinkHref(link.getAttribute("href") ?? "")
      ? "new-tab"
      : "current-tab"
  }
  return isExternalLinkIconClick(link, event) ? "current-tab" : "caret"
}

export function isExternalLinkIconClick(link: Element, event: MouseEvent): boolean {
  const href = link.getAttribute("href") ?? ""
  if (!isExternalLinkHref(href)) return false

  const rects = typeof link.getClientRects === "function"
    ? Array.from(link.getClientRects())
    : []
  const rect = rects.at(-1) ?? link.getBoundingClientRect()
  const fontSize = Number.parseFloat(globalThis.getComputedStyle?.(link).fontSize ?? "16") || 16
  const iconHitWidth = fontSize * 1.1

  return event.clientX >= rect.right - iconHitWidth &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
}

// Helper function to add a link to selected text (used by selection toolbar)
export function addLinkToSelection(view: EditorView, href: string) {
  const { from, to } = view.state.selection
  if (from === to) return false

  const linkMark = view.state.schema.marks.link
  if (!linkMark) return false

  let tr = view.state.tr.addMark(from, to, linkMark.create({ href }))
  tr = tr.setSelection(TextSelection.create(tr.doc, to))
  view.dispatch(tr)
  view.focus()
  return true
}

// Helper to check if selection has link
export function selectionHasLink(view: EditorView): boolean {
  const { from, to } = view.state.selection
  const linkMark = view.state.schema.marks.link
  if (!linkMark) return false
  return view.state.doc.rangeHasMark(from, to, linkMark)
}

// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, TextSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema, Mark } from "prosemirror-model"
import { openEditorHref } from "../platform"

export const linkPluginKey = new PluginKey("link")

// URL detection regex
const URL_REGEX = /^(https?:\/\/|www\.)[^\s]+$/i

function isValidUrl(text: string): boolean {
  return URL_REGEX.test(text.trim())
}

export function linkPlugin(schema: Schema) {
  if (!schema.marks.link) return new Plugin({ key: linkPluginKey })

  return new Plugin({
    key: linkPluginKey,

    props: {
      handleClick(view, pos, event) {
        const target = event.target as HTMLElement
        const link = target.closest("a")

        if (link) {
          event.preventDefault()
          const href = link.getAttribute("href")
          if (href) {
            // Open link in default browser
            const url = href.startsWith("www.") ? "https://" + href : href
            openEditorHref(url)
          }
          return true
        }

        return false
      },

      handlePaste(view, event, slice) {
        const { from, to, empty } = view.state.selection

        // Only apply link if text is selected
        if (empty) return false

        const clipboardText = event.clipboardData?.getData("text/plain")
        if (!clipboardText) return false

        // Check if clipboard contains a valid URL
        if (isValidUrl(clipboardText)) {
          event.preventDefault()

          const linkMark = schema.marks.link
          const href = clipboardText.trim().startsWith("www.")
            ? "https://" + clipboardText.trim()
            : clipboardText.trim()

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
          showEditPopover(editorView, linkDataCopy, schema)
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
      document.addEventListener("mousedown", handleClickOutside)

      return {
        destroy() {
          clearTimers()
          tooltip.remove()
          editorDom.removeEventListener("mouseover", handleMouseOver)
          editorDom.removeEventListener("mouseout", handleMouseOut)
          document.removeEventListener("mousedown", handleClickOutside)
        }
      }
    }
  })
}

function showEditPopover(view: EditorView, linkData: { href: string; from: number; to: number }, schema: Schema) {
  // Remove any existing edit popover
  const existing = document.querySelector(".link-edit-popover")
  if (existing) existing.remove()

  // Get current anchor text
  const anchorText = view.state.doc.textBetween(linkData.from, linkData.to)

  // Create edit popover
  const popover = document.createElement("div")
  popover.className = "link-edit-popover"
  popover.style.cssText = `
    position: absolute;
    z-index: 1002;
    background: white;
    border: 1px solid hsl(214.3, 31.8%, 91.4%);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 280px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `

  // Row 1: Anchor input, Apply button, Remove button
  const anchorRow = document.createElement("div")
  anchorRow.style.cssText = `display: flex; gap: 6px; align-items: center;`

  const anchorInput = document.createElement("input")
  anchorInput.type = "text"
  anchorInput.value = anchorText
  anchorInput.placeholder = "Link text..."
  anchorInput.style.cssText = `
    flex: 1;
    padding: 6px 10px;
    border: 1px solid hsl(214.3, 31.8%, 91.4%);
    border-radius: 6px;
    font-size: 13px;
    outline: none;
  `

  const applyBtn = document.createElement("button")
  applyBtn.textContent = "Apply"
  applyBtn.title = "Apply changes"
  applyBtn.style.cssText = `
    padding: 6px 12px;
    background: hsl(222.2, 47.4%, 11.2%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  `

  const unlinkBtn = document.createElement("button")
  unlinkBtn.title = "Remove link"
  unlinkBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="M5.17 11.75l-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>`
  unlinkBtn.style.cssText = `
    padding: 6px 8px;
    background: transparent;
    border: 1px solid hsl(214.3, 31.8%, 91.4%);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(222.2, 84%, 4.9%);
  `

  anchorRow.appendChild(anchorInput)
  anchorRow.appendChild(applyBtn)
  anchorRow.appendChild(unlinkBtn)
  popover.appendChild(anchorRow)

  // Row 2: URL input
  const urlInput = document.createElement("input")
  urlInput.type = "text"
  urlInput.value = linkData.href
  urlInput.placeholder = "URL..."
  urlInput.style.cssText = `
    width: 100%;
    padding: 6px 10px;
    border: 1px solid hsl(214.3, 31.8%, 91.4%);
    border-radius: 6px;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  `
  popover.appendChild(urlInput)

  // Position popover
  const coords = view.coordsAtPos(linkData.from)
  popover.style.left = `${Math.max(10, coords.left - 100)}px`
  popover.style.top = `${coords.bottom + 8}px`

  document.body.appendChild(popover)

  // Focus anchor input
  setTimeout(() => {
    anchorInput.focus()
    anchorInput.select()
  }, 0)

  // Event handlers
  const closePopover = () => {
    popover.remove()
    view.focus()
  }

  applyBtn.addEventListener("click", (e) => {
    e.preventDefault()
    const newAnchor = anchorInput.value.trim()
    const newHref = urlInput.value.trim()

    if (newAnchor && newHref) {
      const linkMark = schema.marks.link
      // Delete old link text and insert new text with link mark
      let tr = view.state.tr.delete(linkData.from, linkData.to)
      const linkText = schema.text(newAnchor, [linkMark.create({ href: newHref })])
      tr = tr.insert(linkData.from, linkText)
      view.dispatch(tr)
    }
    closePopover()
  })

  unlinkBtn.addEventListener("click", (e) => {
    e.preventDefault()
    const linkMark = schema.marks.link
    const tr = view.state.tr.removeMark(linkData.from, linkData.to, linkMark)
    view.dispatch(tr)
    closePopover()
  })

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      applyBtn.click()
    } else if (e.key === "Escape") {
      closePopover()
    }
  }

  anchorInput.addEventListener("keydown", handleKeydown)
  urlInput.addEventListener("keydown", handleKeydown)

  // Close on outside click
  const handleOutsideClick = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node)) {
      closePopover()
      document.removeEventListener("mousedown", handleOutsideClick)
    }
  }
  setTimeout(() => {
    document.addEventListener("mousedown", handleOutsideClick)
  }, 0)
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

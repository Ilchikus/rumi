// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, TextSelection, NodeSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema, MarkType } from "prosemirror-model"
import { toggleMark } from "prosemirror-commands"
import { highlightColors } from "../schema"

export const selectionToolbarPluginKey = new PluginKey("selectionToolbar")

// Store the last used highlight color
let lastHighlightColor = "yellow"

function isMarkActive(state: any, markType: MarkType): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) {
    return !!markType.isInSet(state.storedMarks || $from.marks())
  }
  return state.doc.rangeHasMark(from, to, markType)
}

function getActiveHighlightColor(state: any, markType: MarkType): string | null {
  const { from, $from, to, empty } = state.selection
  if (empty) {
    const marks = state.storedMarks || $from.marks()
    const highlightMark = marks.find((m: any) => m.type === markType)
    return highlightMark?.attrs.color || null
  }

  let color: string | null = null
  state.doc.nodesBetween(from, to, (node: any) => {
    const mark = node.marks?.find((m: any) => m.type === markType)
    if (mark) {
      color = mark.attrs.color
      return false
    }
  })
  return color
}

// Helper to apply mark and collapse selection (hides toolbar)
function applyMarkAndClose(view: EditorView, markType: MarkType, attrs?: Record<string, unknown>) {
  const { from, to } = view.state.selection
  let tr = view.state.tr.addMark(from, to, markType.create(attrs))
  // Collapse selection to end
  tr = tr.setSelection(TextSelection.create(tr.doc, to))
  view.dispatch(tr)
  view.focus()
}

function removeMarkAndClose(view: EditorView, markType: MarkType) {
  const { from, to } = view.state.selection
  let tr = view.state.tr.removeMark(from, to, markType)
  tr = tr.setSelection(TextSelection.create(tr.doc, to))
  view.dispatch(tr)
  view.focus()
}

function toggleMarkAndClose(view: EditorView, markType: MarkType, attrs?: Record<string, unknown>) {
  const { from, to } = view.state.selection
  const hasMarkInRange = view.state.doc.rangeHasMark(from, to, markType)

  let tr = view.state.tr
  if (hasMarkInRange) {
    tr = tr.removeMark(from, to, markType)
  } else {
    tr = tr.addMark(from, to, markType.create(attrs))
  }
  tr = tr.setSelection(TextSelection.create(tr.doc, to))
  view.dispatch(tr)
  view.focus()
}

export function selectionToolbarPlugin(schema: Schema) {
  const buttonDefs = [
    { name: "bold", icon: "B", mark: "bold", title: "Bold (⌘B)" },
    { name: "italic", icon: "I", mark: "italic", title: "Italic (⌘I)" },
    { name: "underline", icon: "U", mark: "underline", title: "Underline (⌘U)" },
    { name: "strikethrough", icon: "S", mark: "strikethrough", title: "Strikethrough (⌘⇧S)" },
    { name: "code", icon: "<>", mark: "code", title: "Code (⌘E)" },
  ].filter(btn => schema.marks[btn.mark])

  return new Plugin({
    key: selectionToolbarPluginKey,

    view(editorView) {
      const container = document.createElement("div")
      container.className = "selection-toolbar"
      container.style.cssText = `
        position: absolute;
        z-index: 1000;
        background: white;
        border: 1px solid hsl(214.3, 31.8%, 91.4%);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 4px;
        display: none;
        gap: 2px;
        align-items: center;
      `
      document.body.appendChild(container)

      // Create formatting buttons
      buttonDefs.forEach((btn) => {
        const button = document.createElement("button")
        button.className = "toolbar-button"
        button.dataset.mark = btn.mark
        button.innerHTML = btn.icon
        button.title = btn.title
        button.style.cssText = `
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          font-weight: ${btn.name === "bold" ? "700" : "400"};
          font-style: ${btn.name === "italic" ? "italic" : "normal"};
          text-decoration: ${btn.name === "underline" ? "underline" : btn.name === "strikethrough" ? "line-through" : "none"};
          font-size: 14px;
          color: hsl(222.2, 84%, 4.9%);
          display: flex;
          align-items: center;
          justify-content: center;
        `

        button.addEventListener("mousedown", (e) => {
          e.preventDefault()
          const markType = schema.marks[btn.mark]
          if (markType) {
            toggleMarkAndClose(editorView, markType)
          }
        })

        container.appendChild(button)
      })

      // Highlight button with color picker
      if (schema.marks.highlight) {
        // Separator
        const separator = document.createElement("div")
        separator.style.cssText = `width: 1px; height: 20px; background: hsl(214.3, 31.8%, 91.4%); margin: 0 4px;`
        container.appendChild(separator)

        const highlightContainer = document.createElement("div")
        highlightContainer.style.cssText = `display: flex; align-items: center; position: relative;`

        // Main highlight button
        const highlightBtn = document.createElement("button")
        highlightBtn.className = "toolbar-button highlight-btn"
        highlightBtn.title = "Highlight (⌘⇧H)"
        highlightBtn.style.cssText = `
          width: 28px; height: 28px; border: none; background: transparent;
          border-radius: 4px 0 0 4px; cursor: pointer; font-size: 14px; font-weight: 600;
          color: hsl(222.2, 84%, 4.9%); display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 1px;
        `

        const letterA = document.createElement("span")
        letterA.textContent = "A"
        letterA.style.lineHeight = "1"

        const colorBar = document.createElement("div")
        colorBar.className = "highlight-color-bar"
        colorBar.style.cssText = `width: 14px; height: 4px; border-radius: 1px; background: ${highlightColors[lastHighlightColor]};`

        highlightBtn.appendChild(letterA)
        highlightBtn.appendChild(colorBar)

        highlightBtn.addEventListener("mousedown", (e) => {
          e.preventDefault()
          const markType = schema.marks.highlight
          const activeColor = getActiveHighlightColor(editorView.state, markType)

          if (activeColor === lastHighlightColor) {
            // Same color - remove
            removeMarkAndClose(editorView, markType)
          } else if (activeColor) {
            // Different color - change
            const { from, to } = editorView.state.selection
            let tr = editorView.state.tr
              .removeMark(from, to, markType)
              .addMark(from, to, markType.create({ color: lastHighlightColor }))
            tr = tr.setSelection(TextSelection.create(tr.doc, to))
            editorView.dispatch(tr)
            editorView.focus()
          } else {
            // No highlight - apply
            applyMarkAndClose(editorView, markType, { color: lastHighlightColor })
          }
        })

        // Chevron button
        const chevronBtn = document.createElement("button")
        chevronBtn.className = "toolbar-button chevron-btn"
        chevronBtn.title = "Choose highlight color"
        chevronBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        chevronBtn.style.cssText = `
          width: 18px; height: 28px; border: none; background: transparent;
          border-radius: 0 4px 4px 0; cursor: pointer; display: flex;
          align-items: center; justify-content: center; color: hsl(215.4, 16.3%, 46.9%);
          border-left: 1px solid hsl(214.3, 31.8%, 91.4%);
        `

        // Color picker
        const colorPicker = document.createElement("div")
        colorPicker.className = "highlight-color-picker"
        colorPicker.style.cssText = `
          position: absolute; top: 100%; right: 0; margin-top: 4px;
          background: white; border: 1px solid hsl(214.3, 31.8%, 91.4%);
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 8px; display: none; grid-template-columns: repeat(4, 1fr);
          gap: 6px; width: 120px;
        `

        Object.entries(highlightColors).forEach(([name, color]) => {
          const colorBtn = document.createElement("button")
          colorBtn.className = "color-option"
          colorBtn.dataset.color = name
          colorBtn.title = name.charAt(0).toUpperCase() + name.slice(1)
          colorBtn.style.cssText = `
            width: 24px; height: 24px; border: 2px solid transparent;
            background: ${color}; border-radius: 4px; cursor: pointer;
          `

          colorBtn.addEventListener("mousedown", (e) => {
            e.preventDefault()
            e.stopPropagation()

            lastHighlightColor = name
            colorBar.style.background = color
            colorPicker.style.display = "none"

            const markType = schema.marks.highlight
            const activeColor = getActiveHighlightColor(editorView.state, markType)

            if (activeColor === name) {
              // Same color - remove
              removeMarkAndClose(editorView, markType)
            } else if (activeColor) {
              // Different color - change
              const { from, to } = editorView.state.selection
              let tr = editorView.state.tr
                .removeMark(from, to, markType)
                .addMark(from, to, markType.create({ color: name }))
              tr = tr.setSelection(TextSelection.create(tr.doc, to))
              editorView.dispatch(tr)
              editorView.focus()
            } else {
              // No highlight - apply
              applyMarkAndClose(editorView, markType, { color: name })
            }
          })

          colorPicker.appendChild(colorBtn)
        })

        chevronBtn.addEventListener("mousedown", (e) => {
          e.preventDefault()
          e.stopPropagation()
          const isVisible = colorPicker.style.display === "grid"
          colorPicker.style.display = isVisible ? "none" : "grid"

          if (!isVisible) {
            colorPicker.querySelectorAll(".color-option").forEach((btn) => {
              const el = btn as HTMLElement
              el.style.borderColor = el.dataset.color === lastHighlightColor ? "hsl(222.2, 47.4%, 41.2%)" : "transparent"
            })
          }
        })

        highlightContainer.appendChild(highlightBtn)
        highlightContainer.appendChild(chevronBtn)
        highlightContainer.appendChild(colorPicker)
        container.appendChild(highlightContainer)
      }

      // Link button
      if (schema.marks.link) {
        // Separator
        const separator2 = document.createElement("div")
        separator2.style.cssText = `width: 1px; height: 20px; background: hsl(214.3, 31.8%, 91.4%); margin: 0 4px;`
        container.appendChild(separator2)

        const linkContainer = document.createElement("div")
        linkContainer.style.cssText = `display: flex; align-items: center; position: relative;`

        const linkBtn = document.createElement("button")
        linkBtn.className = "toolbar-button link-btn"
        linkBtn.title = "Link (⌘K)"
        linkBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
        linkBtn.style.cssText = `
          width: 28px; height: 28px; border: none; background: transparent;
          border-radius: 4px; cursor: pointer; display: flex;
          align-items: center; justify-content: center; color: hsl(222.2, 84%, 4.9%);
        `

        // Link input popup
        const linkPopup = document.createElement("div")
        linkPopup.className = "link-input-popup"
        linkPopup.style.cssText = `
          position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
          margin-top: 8px; background: white; border: 1px solid hsl(214.3, 31.8%, 91.4%);
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 8px; display: none; width: 260px;
        `

        const linkInputRow = document.createElement("div")
        linkInputRow.style.cssText = `display: flex; gap: 8px;`

        const linkInput = document.createElement("input")
        linkInput.type = "text"
        linkInput.placeholder = "Enter URL or file path..."
        linkInput.style.cssText = `
          flex: 1; padding: 6px 10px; border: 1px solid hsl(214.3, 31.8%, 91.4%);
          border-radius: 6px; font-size: 13px; outline: none;
        `

        const linkApplyBtn = document.createElement("button")
        linkApplyBtn.textContent = "Add"
        linkApplyBtn.style.cssText = `
          padding: 6px 12px; background: hsl(222.2, 47.4%, 11.2%); color: white;
          border: none; border-radius: 6px; font-size: 13px; cursor: pointer;
        `

        linkInputRow.appendChild(linkInput)
        linkInputRow.appendChild(linkApplyBtn)
        linkPopup.appendChild(linkInputRow)

        let savedSelection: { from: number; to: number } | null = null

        linkBtn.addEventListener("mousedown", (e) => {
          e.preventDefault()
          e.stopPropagation()

          const { from, to, empty } = editorView.state.selection
          if (empty) return

          // Check if already has link - if so, remove it
          const linkMark = schema.marks.link
          if (editorView.state.doc.rangeHasMark(from, to, linkMark)) {
            let tr = editorView.state.tr.removeMark(from, to, linkMark)
            editorView.dispatch(tr)
            editorView.focus()
            return
          }

          // Save current selection and show popup
          savedSelection = { from, to }
          linkPopup.style.display = "block"
          linkInput.value = ""
          setTimeout(() => linkInput.focus(), 0)
        })

        linkApplyBtn.addEventListener("mousedown", (e) => {
          e.preventDefault()
          e.stopPropagation()

          const href = linkInput.value.trim()
          if (href && savedSelection) {
            const linkMark = schema.marks.link
            const { from, to } = savedSelection
            let tr = editorView.state.tr.addMark(from, to, linkMark.create({ href }))
            tr = tr.setSelection(TextSelection.create(tr.doc, to))
            editorView.dispatch(tr)
          }
          linkPopup.style.display = "none"
          savedSelection = null
          editorView.focus()
        })

        linkInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            linkApplyBtn.dispatchEvent(new MouseEvent("mousedown"))
          } else if (e.key === "Escape") {
            linkPopup.style.display = "none"
            savedSelection = null
            editorView.focus()
          }
        })

        linkContainer.appendChild(linkBtn)
        linkContainer.appendChild(linkPopup)
        container.appendChild(linkContainer)
      }

      function update() {
        const { state } = editorView
        const { selection } = state
        const { empty, from, to } = selection

        // Close color picker and link popup on any update
        const colorPicker = container.querySelector(".highlight-color-picker") as HTMLElement
        if (colorPicker) colorPicker.style.display = "none"
        const linkPopup = container.querySelector(".link-input-popup") as HTMLElement
        if (linkPopup) linkPopup.style.display = "none"

        // Hide if no selection or block selection
        if (empty || from === to || selection instanceof NodeSelection) {
          container.style.display = "none"
          return
        }

        // Hide if in code block
        if (state.selection.$from.parent.type.spec.code) {
          container.style.display = "none"
          return
        }

        // Position and show
        const start = editorView.coordsAtPos(from)
        const end = editorView.coordsAtPos(to)
        container.style.left = `${Math.max(10, (start.left + end.left) / 2 - 120)}px`
        container.style.top = `${Math.max(10, Math.min(start.top, end.top) - 44)}px`
        container.style.display = "flex"

        // Update button states
        buttonDefs.forEach((btn) => {
          const button = container.querySelector(`[data-mark="${btn.mark}"]`) as HTMLElement
          if (button) {
            const markType = schema.marks[btn.mark]
            button.style.background = isMarkActive(state, markType) ? "hsl(210, 40%, 96.1%)" : "transparent"
          }
        })

        // Update highlight button
        const highlightBtn = container.querySelector(".highlight-btn") as HTMLElement
        if (highlightBtn && schema.marks.highlight) {
          const markType = schema.marks.highlight
          highlightBtn.style.background = isMarkActive(state, markType) ? "hsl(210, 40%, 96.1%)" : "transparent"

          const activeColor = getActiveHighlightColor(state, markType)
          const bar = highlightBtn.querySelector(".highlight-color-bar") as HTMLElement
          if (bar) bar.style.background = highlightColors[activeColor || lastHighlightColor] || highlightColors.yellow
        }

        // Update link button
        const linkBtn = container.querySelector(".link-btn") as HTMLElement
        if (linkBtn && schema.marks.link) {
          const markType = schema.marks.link
          linkBtn.style.background = isMarkActive(state, markType) ? "hsl(210, 40%, 96.1%)" : "transparent"
        }
      }

      // Close toolbar and picker on outside click (capture phase to catch all clicks)
      const handleOutsideClick = (e: MouseEvent) => {
        // If click is inside the toolbar, let it handle normally
        if (container.contains(e.target as Node)) return

        // Close color picker
        const picker = container.querySelector(".highlight-color-picker") as HTMLElement
        if (picker) picker.style.display = "none"

        // Close link popup
        const linkPopup = container.querySelector(".link-input-popup") as HTMLElement
        if (linkPopup) linkPopup.style.display = "none"

        // If toolbar is visible, collapse selection to hide it
        if (container.style.display === "flex") {
          const { selection } = editorView.state
          if (!selection.empty) {
            // Collapse selection to end position
            const tr = editorView.state.tr.setSelection(
              TextSelection.create(editorView.state.doc, selection.to)
            )
            editorView.dispatch(tr)
          }
        }
      }
      // Use capture phase to catch clicks anywhere in the app
      document.addEventListener("mousedown", handleOutsideClick, true)

      return {
        update,
        destroy() {
          document.removeEventListener("mousedown", handleOutsideClick, true)
          container.remove()
        }
      }
    }
  })
}

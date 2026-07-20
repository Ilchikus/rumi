// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, TextSelection, NodeSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema, MarkType } from "prosemirror-model"

export const selectionToolbarPluginKey = new PluginKey("selectionToolbar")

function isMarkActive(state: any, markType: MarkType): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) {
    return !!markType.isInSet(state.storedMarks || $from.marks())
  }
  return state.doc.rangeHasMark(from, to, markType)
}

function toggleMarkAndClose(view: EditorView, markType: MarkType) {
  const { from, to } = view.state.selection
  const hasMarkInRange = view.state.doc.rangeHasMark(from, to, markType)

  let tr = view.state.tr
  if (hasMarkInRange) {
    tr = tr.removeMark(from, to, markType)
  } else {
    tr = tr.addMark(from, to, markType.create())
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

      // Highlight is intentionally binary: default yellow or no highlight.
      if (schema.marks.highlight) {
        const separator = document.createElement("div")
        separator.style.cssText = `width: 1px; height: 20px; background: hsl(214.3, 31.8%, 91.4%); margin: 0 4px;`
        container.appendChild(separator)

        const highlightBtn = document.createElement("button")
        highlightBtn.className = "toolbar-button highlight-btn"
        highlightBtn.title = "Highlight (⌘⇧H)"
        highlightBtn.style.cssText = `
          width: 28px; height: 28px; border: none; background: transparent;
          border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600;
          color: hsl(222.2, 84%, 4.9%); display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 1px;
        `

        const letterA = document.createElement("span")
        letterA.textContent = "A"
        letterA.style.lineHeight = "1"

        const colorBar = document.createElement("div")
        colorBar.className = "highlight-color-bar"
        colorBar.style.cssText = `width: 14px; height: 4px; border-radius: 1px; background: #fef08a;`

        highlightBtn.appendChild(letterA)
        highlightBtn.appendChild(colorBar)

        highlightBtn.addEventListener("mousedown", (e) => {
          e.preventDefault()
          toggleMarkAndClose(editorView, schema.marks.highlight)
        })

        container.appendChild(highlightBtn)
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

        // Close the link popup on any update
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
        }

        // Update link button
        const linkBtn = container.querySelector(".link-btn") as HTMLElement
        if (linkBtn && schema.marks.link) {
          const markType = schema.marks.link
          linkBtn.style.background = isMarkActive(state, markType) ? "hsl(210, 40%, 96.1%)" : "transparent"
        }
      }

      // Close the toolbar on outside click (capture phase to catch all clicks)
      const handleOutsideClick = (e: MouseEvent) => {
        // If click is inside the toolbar, let it handle normally
        if (container.contains(e.target as Node)) return

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

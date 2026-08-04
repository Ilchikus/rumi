// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import {
  Plugin,
  PluginKey,
  TextSelection,
  NodeSelection,
  type Command
} from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema, MarkType } from "prosemirror-model"
import type { EditorToolbarMode } from "@rumi/contracts"
import {
  redoEditorChange,
  undoEditorChange
} from "../editorHistory"
import {
  applyInlineMarkToRanges,
  isInlineMarkActive,
  selectedBlockInlineRanges,
  toggleInlineMark
} from "./inlineFormatting"
import { BLOCK_TYPE_OPTIONS } from "./blockTypePresentation"
import {
  allowedMediaAccept,
  changeToolbarBlockType,
  chooseAndInsertToolbarMedia,
  deleteToolbarBlocks,
  insertAdjacentParagraph,
  isToolbarBlockTypeActive,
  moveToolbarBlocks
} from "./topToolbarActions"
import { moveBlocks } from "./multiBlockSelection"

export const selectionToolbarPluginKey = new PluginKey("selectionToolbar")

interface SelectionToolbarPreferences {
  mode: EditorToolbarMode
  allowedUploadFileTypes: readonly string[]
}

interface SelectionToolbarState extends SelectionToolbarPreferences {
  linkEditorRequestRevision: number
}

const ARROW_LINE_UP_SVG = phosphorSvg("M205.66,138.34a8,8,0,0,1-11.32,11.32L136,91.31V224a8,8,0,0,1-16,0V91.31L61.66,149.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0ZM216,32H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z")
const ARROW_LINE_DOWN_SVG = phosphorSvg("M50.34,117.66a8,8,0,0,1,11.32-11.32L120,164.69V32a8,8,0,0,1,16,0V164.69l58.34-58.35a8,8,0,0,1,11.32,11.32l-72,72a8,8,0,0,1-11.32,0ZM216,208H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z")
const ARROW_UP_SVG = phosphorSvg("M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z")
const ARROW_DOWN_SVG = phosphorSvg("M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z")
const UPLOAD_SVG = phosphorSvg("M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0ZM93.66,77.66,120,51.31V144a8,8,0,0,0,16,0V51.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,77.66Z")
const UNDO_SVG = phosphorSvg("M232,144a64.07,64.07,0,0,1-64,64H80a8,8,0,0,1,0-16h88a48,48,0,0,0,0-96H51.31l34.35,34.34a8,8,0,0,1-11.32,11.32l-48-48a8,8,0,0,1,0-11.32l48-48A8,8,0,0,1,85.66,45.66L51.31,80H168A64.07,64.07,0,0,1,232,144Z")
const REDO_SVG = phosphorSvg("M170.34,130.34,204.69,96H88a48,48,0,0,0,0,96h88a8,8,0,0,1,0,16H88A64,64,0,0,1,88,80H204.69L170.34,45.66a8,8,0,0,1,11.32-11.32l48,48a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32-11.32Z")
const TRASH_SVG = phosphorSvg("M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z")

const EDITOR_TOOLBAR_BLOCK_TYPE_OPTIONS = BLOCK_TYPE_OPTIONS.filter(
  ({ type }) => !["mermaid", "table", "horizontal_rule"].includes(type)
)

export function setSelectionToolbarPreferences(
  view: EditorView,
  preferences: SelectionToolbarPreferences
): void {
  view.dispatch(view.state.tr.setMeta(selectionToolbarPluginKey, preferences))
}

export const openSelectionToolbarLinkEditor: Command = (state, dispatch) => {
  const toolbarState = selectionToolbarPluginKey.getState(state) as
    | SelectionToolbarState
    | undefined
  const hasBlockSelection = selectedBlockInlineRanges(state).length > 0
  if (
    toolbarState?.mode === "none" ||
    (!hasBlockSelection && state.selection.empty)
  ) return false

  dispatch?.(
    state.tr
      .setMeta(selectionToolbarPluginKey, {
        linkEditorRequestRevision:
          (toolbarState?.linkEditorRequestRevision ?? 0) + 1
      })
      .setMeta("addToHistory", false)
  )
  return true
}

function toggleToolbarMark(view: EditorView, markType: MarkType) {
  const blockSelection = selectedBlockInlineRanges(view.state).length > 0
  const { empty, to } = view.state.selection
  const mode = selectionToolbarPluginKey.getState(view.state)?.mode ?? "floating"
  toggleInlineMark(markType)(view.state, view.dispatch)
  if (mode === "floating" && !blockSelection && !empty) {
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, to))
    )
  }
  view.focus()
}

export function selectionToolbarPlugin(
  schema: Schema,
  initialMode: EditorToolbarMode = "floating",
  initialAllowedUploadFileTypes: readonly string[] = []
) {
  const buttonDefs = [
    { name: "bold", icon: "B", mark: "bold", title: "Bold (⌘B)" },
    { name: "italic", icon: "I", mark: "italic", title: "Italic (⌘I)" },
    { name: "underline", icon: "U", mark: "underline", title: "Underline (⌘U)" },
    { name: "strikethrough", icon: "S", mark: "strikethrough", title: "Strikethrough (⌘⇧S)" },
    { name: "code", icon: "<>", mark: "code", title: "Code (⌘E)" },
  ].filter(btn => schema.marks[btn.mark])

  return new Plugin({
    key: selectionToolbarPluginKey,

    state: {
      init: (): SelectionToolbarState => ({
        mode: initialMode,
        allowedUploadFileTypes: initialAllowedUploadFileTypes,
        linkEditorRequestRevision: 0
      }),
      apply(transaction, value) {
        return {
          ...value,
          ...(transaction.getMeta(selectionToolbarPluginKey) ?? {})
        }
      }
    },

    view(editorView) {
      const container = document.createElement("div")
      container.className = "selection-toolbar"
      container.dataset.rumiEditorOverlay = ""
      container.setAttribute("role", "toolbar")
      container.setAttribute("aria-label", "Editor formatting")
      document.body.appendChild(container)

      const editorControls = document.createElement("div")
      editorControls.className = "selection-toolbar-editor-controls"
      container.appendChild(editorControls)

      const arrowGroup = createToolbarGroup(
        "selection-toolbar-arrow-group",
        "Block placement and movement"
      )
      editorControls.appendChild(arrowGroup)

      const historyGroup = createToolbarGroup(
        "selection-toolbar-history-group",
        "History"
      )
      editorControls.appendChild(historyGroup)

      const blockGroup = createToolbarGroup(
        "selection-toolbar-block-group",
        "Block type and media"
      )
      editorControls.appendChild(blockGroup)

      const inlineGroup = createToolbarGroup(
        "selection-toolbar-inline-group",
        "Inline formatting"
      )
      container.appendChild(inlineGroup)

      const deleteGroup = createToolbarGroup(
        "selection-toolbar-delete-group",
        "Delete block"
      )
      container.appendChild(deleteGroup)

      const addBeforeButton = createEditorToolbarButton(
        "Add before (⇧⌘↵)",
        ARROW_LINE_UP_SVG,
        () => insertAdjacentParagraph(editorView, "before")
      )
      addBeforeButton.dataset.editorToolbarAction = "add-before"
      arrowGroup.appendChild(addBeforeButton)

      const addAfterButton = createEditorToolbarButton(
        "Add after (⌘↵)",
        ARROW_LINE_DOWN_SVG,
        () => insertAdjacentParagraph(editorView, "after")
      )
      addAfterButton.dataset.editorToolbarAction = "add-after"
      arrowGroup.appendChild(addAfterButton)

      const moveUpButton = createEditorToolbarButton(
        "Move up (⌃⇧↑)",
        ARROW_UP_SVG,
        () => moveToolbarBlocks(editorView, "up")
      )
      moveUpButton.dataset.editorToolbarAction = "move-up"
      arrowGroup.appendChild(moveUpButton)

      const moveDownButton = createEditorToolbarButton(
        "Move down (⌃⇧↓)",
        ARROW_DOWN_SVG,
        () => moveToolbarBlocks(editorView, "down")
      )
      moveDownButton.dataset.editorToolbarAction = "move-down"
      arrowGroup.appendChild(moveDownButton)

      const undoButton = createEditorToolbarButton(
        "Undo (⌘Z)",
        UNDO_SVG,
        () => runHistoryCommand(editorView, undoEditorChange)
      )
      undoButton.dataset.editorToolbarAction = "undo"
      historyGroup.appendChild(undoButton)

      const redoButton = createEditorToolbarButton(
        "Redo (⇧⌘Z)",
        REDO_SVG,
        () => runHistoryCommand(editorView, redoEditorChange)
      )
      redoButton.dataset.editorToolbarAction = "redo"
      historyGroup.appendChild(redoButton)

      EDITOR_TOOLBAR_BLOCK_TYPE_OPTIONS.forEach((option) => {
        const button = createEditorToolbarButton(
          `${option.label} (⌘/)`,
          option.icon,
          () => changeToolbarBlockType(editorView, option)
        )
        button.dataset.blockType = option.type
        if (option.type === "heading") {
          button.dataset.blockAttrs = JSON.stringify(option.attrs)
        }
        blockGroup.appendChild(button)
      })

      const uploadButton = createEditorToolbarButton(
        "Upload media",
        UPLOAD_SVG,
        () => {
          const allowedFileTypes = selectionToolbarPluginKey
            .getState(editorView.state)?.allowedUploadFileTypes ?? []
          void chooseAndInsertToolbarMedia(editorView, allowedFileTypes)
        }
      )
      uploadButton.dataset.editorToolbarAction = "upload-media"
      blockGroup.appendChild(uploadButton)

      const deleteButton = createEditorToolbarButton(
        "Delete block",
        TRASH_SVG,
        () => deleteToolbarBlocks(editorView)
      )
      deleteButton.dataset.editorToolbarAction = "delete-block"
      deleteButton.classList.add("editor-toolbar-delete-button")
      deleteGroup.appendChild(deleteButton)

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

        button.addEventListener("mousedown", preserveEditorSelection)
        button.addEventListener("click", (e) => {
          e.preventDefault()
          const markType = schema.marks[btn.mark]
          if (markType) {
            toggleToolbarMark(editorView, markType)
          }
        })

        inlineGroup.appendChild(button)
      })

      // Highlight is intentionally binary: default yellow or no highlight.
      if (schema.marks.highlight) {
        inlineGroup.appendChild(createInlineToolbarSeparator())

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

        const highlightIndicator = document.createElement("div")
        highlightIndicator.className = "highlight-indicator"
        highlightIndicator.style.cssText = `width: 14px; height: 4px; border-radius: 1px; background: #fef08a;`

        highlightBtn.appendChild(letterA)
        highlightBtn.appendChild(highlightIndicator)

        highlightBtn.addEventListener("mousedown", preserveEditorSelection)
        highlightBtn.addEventListener("click", (e) => {
          e.preventDefault()
          toggleToolbarMark(editorView, schema.marks.highlight)
        })

        inlineGroup.appendChild(highlightBtn)
      }

      // Link button
      let linkButton: HTMLButtonElement | null = null
      if (schema.marks.link) {
        inlineGroup.appendChild(createInlineToolbarSeparator())

        const linkContainer = document.createElement("div")
        linkContainer.style.cssText = `display: flex; align-items: center; position: relative;`

        const linkBtn = document.createElement("button")
        linkButton = linkBtn
        linkBtn.className = "toolbar-button link-btn"
        linkBtn.title = "Link (⌘⇧K)"
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

        let savedSelection: {
          ranges: Array<{ from: number; to: number }>
          blockSelection: boolean
        } | null = null

        linkBtn.addEventListener("mousedown", (e) => {
          e.preventDefault()
          e.stopPropagation()
        })

        linkBtn.addEventListener("click", (e) => {
          e.preventDefault()
          e.stopPropagation()

          const { from, to, empty } = editorView.state.selection
          const blockRanges = selectedBlockInlineRanges(editorView.state)
          const blockSelection = blockRanges.length > 0
          if (!blockSelection && empty) return

          // Check if already has link - if so, remove it
          const linkMark = schema.marks.link
          if (isInlineMarkActive(editorView.state, linkMark)) {
            let tr = editorView.state.tr
            const ranges = blockSelection ? blockRanges : [{ from, to }]
            for (const range of ranges) {
              tr = tr.removeMark(range.from, range.to, linkMark)
            }
            if (blockSelection) tr.setMeta("multiBlockKeep", true)
            editorView.dispatch(tr)
            editorView.focus()
            return
          }

          // Save current selection and show popup
          savedSelection = {
            ranges: blockSelection ? blockRanges : [{ from, to }],
            blockSelection
          }
          linkPopup.style.display = "block"
          linkInput.value = ""
          setTimeout(() => linkInput.focus(), 0)
        })

        linkApplyBtn.addEventListener("mousedown", preserveEditorSelection)
        linkApplyBtn.addEventListener("click", (e) => {
          e.preventDefault()
          e.stopPropagation()

          const href = linkInput.value.trim()
          if (href && savedSelection) {
            const linkMark = schema.marks.link
            const { ranges, blockSelection } = savedSelection
            let tr = applyInlineMarkToRanges(
              editorView.state.tr,
              ranges,
              linkMark,
              { href }
            )
            if (blockSelection) {
              tr.setMeta("multiBlockKeep", true)
            } else if (ranges.at(-1)) {
              tr = tr.setSelection(TextSelection.create(tr.doc, ranges.at(-1).to))
            }
            editorView.dispatch(tr)
          }
          linkPopup.style.display = "none"
          savedSelection = null
          editorView.focus()
        })

        linkInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            linkApplyBtn.click()
          } else if (e.key === "Escape") {
            linkPopup.style.display = "none"
            savedSelection = null
            editorView.focus()
          }
        })

        linkContainer.appendChild(linkBtn)
        linkContainer.appendChild(linkPopup)
        inlineGroup.appendChild(linkContainer)
      }

      let currentMode: EditorToolbarMode | null = null
      let handledLinkEditorRequestRevision = 0
      let destroyed = false
      const editorToolbarHost = editorView.dom.parentElement
      const editorCanvas = editorView.dom.closest<HTMLElement>("[data-rumi-editor-canvas]")

      function clearEditorToolbarBounds() {
        container.style.removeProperty("width")
        container.style.removeProperty("transform")
        container.style.removeProperty("--rumi-editor-toolbar-top")
      }

      function syncEditorToolbarBounds() {
        if (!currentMode || !isExpandedEditorToolbarMode(currentMode)) return
        if (currentMode === "top") {
          const canvasTop = editorCanvas?.getBoundingClientRect().top
          if (canvasTop !== undefined && canvasTop >= 0) {
            container.style.setProperty("--rumi-editor-toolbar-top", `${canvasTop + 20}px`)
          }
        } else {
          container.style.removeProperty("--rumi-editor-toolbar-top")
        }
        const rect = editorToolbarHost?.getBoundingClientRect()
        if (!rect || rect.width <= 0) {
          container.style.removeProperty("left")
          clearEditorToolbarBounds()
          return
        }

        const viewportPadding = 16
        const left = Math.max(viewportPadding, rect.left)
        const right = Math.min(window.innerWidth - viewportPadding, rect.right)
        if (right <= left) return

        container.style.left = `${left}px`
        container.style.width = `${right - left}px`
        container.style.transform = "none"
      }

      function placeContainer(mode: EditorToolbarMode) {
        const correctlyPlaced = container.parentElement === document.body
        if (currentMode === mode && correctlyPlaced) return
        currentMode = mode
        container.dataset.mode = mode

        if (container.parentElement !== document.body) {
          document.body.appendChild(container)
        }
      }

      function update() {
        const { state } = editorView
        const { selection } = state
        const { empty, from, to } = selection
        const preferences = selectionToolbarPluginKey.getState(state) ?? {
          mode: initialMode,
          allowedUploadFileTypes: initialAllowedUploadFileTypes,
          linkEditorRequestRevision: 0
        }
        const mode = preferences.mode
        const blockRanges = selectedBlockInlineRanges(state)
        const hasBlockSelection = blockRanges.length > 0

        placeContainer(mode)
        container.toggleAttribute(
          "data-rumi-preserve-block-selection",
          isExpandedEditorToolbarMode(mode)
        )

        // Close the link popup on any update
        const linkPopup = container.querySelector(".link-input-popup") as HTMLElement
        if (linkPopup) linkPopup.style.display = "none"

        if (mode === "none" || !editorView.editable) {
          container.style.display = "none"
          return
        }

        const hasTextSelection = !empty && from !== to && !(selection instanceof NodeSelection)
        const textSelectionInCode = hasTextSelection && selection.$from.parent.type.spec.code
        if (mode === "floating" && (!hasBlockSelection && (!hasTextSelection || textSelectionInCode))) {
          container.style.display = "none"
          return
        }

        container.style.display = "flex"
        if (mode === "floating") {
          clearEditorToolbarBounds()
          const selectedRects = blockRanges.flatMap((range) => {
            const dom = editorView.nodeDOM(range.from - 1)
            return dom instanceof HTMLElement ? [dom.getBoundingClientRect()] : []
          })
          const start = hasBlockSelection ? null : editorView.coordsAtPos(from)
          const end = hasBlockSelection ? null : editorView.coordsAtPos(to)
          const leftEdge = selectedRects.length > 0
            ? Math.min(...selectedRects.map((rect) => rect.left))
            : Math.min(start?.left ?? 10, end?.left ?? 10)
          const rightEdge = selectedRects.length > 0
            ? Math.max(...selectedRects.map((rect) => rect.right))
            : Math.max(start?.left ?? 10, end?.left ?? 10)
          const selectionTop = selectedRects.length > 0
            ? Math.min(...selectedRects.map((rect) => rect.top))
            : Math.min(start?.top ?? 10, end?.top ?? 10)
          const toolbarWidth = container.offsetWidth
          const toolbarHeight = container.offsetHeight
          const centeredLeft = (leftEdge + rightEdge - toolbarWidth) / 2
          container.style.left = `${Math.max(10, Math.min(centeredLeft, window.innerWidth - toolbarWidth - 10))}px`
          container.style.top = `${Math.max(10, selectionTop - toolbarHeight - 8)}px`
        } else {
          container.style.removeProperty("top")
          syncEditorToolbarBounds()
        }

        if (
          linkButton &&
          preferences.linkEditorRequestRevision >
            handledLinkEditorRequestRevision
        ) {
          handledLinkEditorRequestRevision =
            preferences.linkEditorRequestRevision
          queueMicrotask(() => {
            if (!destroyed) linkButton?.click()
          })
        }

        if (isExpandedEditorToolbarMode(mode)) {
          addBeforeButton.disabled = false
          addAfterButton.disabled = false
          moveUpButton.disabled = !moveBlocks("up")(state)
          moveDownButton.disabled = !moveBlocks("down")(state)
          undoButton.disabled = !undoEditorChange(state)
          redoButton.disabled = !redoEditorChange(state)
          uploadButton.disabled = !allowedMediaAccept(
            preferences.allowedUploadFileTypes
          )

          for (const option of EDITOR_TOOLBAR_BLOCK_TYPE_OPTIONS) {
            const selector = option.type === "heading"
              ? `[data-block-type="heading"][data-block-attrs='${JSON.stringify(option.attrs)}']`
              : `[data-block-type="${option.type}"]`
            const button = editorControls.querySelector(selector) as HTMLElement | null
            button?.classList.toggle(
              "active",
              isToolbarBlockTypeActive(state, option)
            )
          }
        }

        // Update button states
        buttonDefs.forEach((btn) => {
          const button = container.querySelector(`[data-mark="${btn.mark}"]`) as HTMLElement
          if (button) {
            const markType = schema.marks[btn.mark]
            button.style.background = isInlineMarkActive(state, markType) ? "hsl(210, 40%, 96.1%)" : "transparent"
          }
        })

        // Update highlight button
        const highlightBtn = container.querySelector(".highlight-btn") as HTMLElement
        if (highlightBtn && schema.marks.highlight) {
          const markType = schema.marks.highlight
          highlightBtn.style.background = isInlineMarkActive(state, markType) ? "hsl(210, 40%, 96.1%)" : "transparent"
        }

        // Update link button
        const linkBtn = container.querySelector(".link-btn") as HTMLElement
        if (linkBtn && schema.marks.link) {
          const markType = schema.marks.link
          linkBtn.style.background = isInlineMarkActive(state, markType) ? "hsl(210, 40%, 96.1%)" : "transparent"
        }
      }

      // Close the toolbar on outside click (capture phase to catch all clicks)
      const handleOutsideClick = (e: MouseEvent) => {
        // If click is inside the toolbar, let it handle normally
        if (container.contains(e.target as Node)) return

        // Close link popup
        const linkPopup = container.querySelector(".link-input-popup") as HTMLElement
        if (linkPopup) linkPopup.style.display = "none"

        // Preserve selections for the always-visible editor toolbar. Floating
        // text selections keep their established outside-click behavior.
        if (currentMode === "floating" && container.style.display === "flex") {
          const { selection } = editorView.state
          if (!selection.empty && !(selection instanceof NodeSelection)) {
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
      window.addEventListener("resize", syncEditorToolbarBounds)
      const resizeObserver = typeof ResizeObserver === "undefined" || !editorToolbarHost
        ? null
        : new ResizeObserver(syncEditorToolbarBounds)
      resizeObserver?.observe(editorToolbarHost)

      update()

      return {
        update,
        destroy() {
          destroyed = true
          document.removeEventListener("mousedown", handleOutsideClick, true)
          window.removeEventListener("resize", syncEditorToolbarBounds)
          resizeObserver?.disconnect()
          container.remove()
        }
      }
    }
  })
}

function createEditorToolbarButton(
  title: string,
  icon: string,
  run: () => void
): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "toolbar-button editor-toolbar-button"
  button.title = title
  button.setAttribute("aria-label", title)
  button.innerHTML = icon
  button.addEventListener("mousedown", preserveEditorSelection)
  button.addEventListener("click", (event) => {
    event.preventDefault()
    run()
  })
  return button
}

function isExpandedEditorToolbarMode(mode: EditorToolbarMode): boolean {
  return mode === "top" || mode === "bottom"
}

function createToolbarGroup(className: string, label: string): HTMLDivElement {
  const group = document.createElement("div")
  group.className = `selection-toolbar-group ${className}`
  group.setAttribute("role", "group")
  group.setAttribute("aria-label", label)
  return group
}

function runHistoryCommand(
  view: EditorView,
  command: typeof undoEditorChange
): void {
  if (command(view.state, view.dispatch)) view.focus()
}

function createInlineToolbarSeparator(): HTMLDivElement {
  const separator = document.createElement("div")
  separator.className = "inline-toolbar-separator"
  separator.setAttribute("aria-hidden", "true")
  return separator
}

function preserveEditorSelection(event: MouseEvent): void {
  event.preventDefault()
}

function phosphorSvg(path: string): string {
  return `<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="${path}"></path></svg>`
}

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
import { moveBlocks, multiBlockSelectionKey } from "./multiBlockSelection"
import {
  migratedEditorPlatform,
  openEditorHref,
  type MigratedEditorDocument
} from "../platform"
import {
  isExternalLinkHref,
  normalizeLinkHref
} from "../linkHref"
import { linkRangeAtSelection } from "../linkSelection"

export const selectionToolbarPluginKey = new PluginKey("selectionToolbar")

function normalizedSuggestionValue(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .normalize("NFKC")
    .toLocaleLowerCase()
}

function withoutMarkdownExtension(value: string): string {
  return value.endsWith(".md") ? value.slice(0, -3) : value
}

function documentSuggestionRank(
  document: MigratedEditorDocument,
  query: string
): number | null {
  const title = normalizedSuggestionValue(document.title)
  const paths = [document.path, document.nodePath]
    .map(normalizedSuggestionValue)
    .filter((path, index, all) => path && all.indexOf(path) === index)
  const basenames = paths.map((path) => path.split("/").at(-1) ?? path)
  const queryHasPath = query.includes("/")

  if (!queryHasPath) {
    const names = [title, ...basenames]
    const exactName = names.some((name) =>
      name === query || withoutMarkdownExtension(name) === query
    )
    if (exactName) return 0

    const nameStarts = names.some((name) =>
      name.startsWith(query) || withoutMarkdownExtension(name).startsWith(query)
    )
    if (nameStarts) return 10

    const nameContains = names.some((name) => name.includes(query))
    if (nameContains) return 20
  }

  const exactPath = paths.some((path) =>
    path === query || withoutMarkdownExtension(path) === query
  )
  if (exactPath) return queryHasPath ? 0 : 30

  const pathStarts = paths.some((path) =>
    path.startsWith(query) || withoutMarkdownExtension(path).startsWith(query)
  )
  if (pathStarts) return queryHasPath ? 10 : 40

  const pathBoundaryMatch = paths.some((path) =>
    path.includes(`/${query}`) || withoutMarkdownExtension(path).includes(`/${query}`)
  )
  if (pathBoundaryMatch) return queryHasPath ? 20 : 50

  const pathContains = paths.some((path) => path.includes(query))
  if (pathContains) return queryHasPath ? 30 : 60

  // A path-shaped query must keep its directory context. Falling back to a
  // matching basename here would make /docs/todo compete with every todo.md.
  if (queryHasPath) return null

  return null
}

export function linkDestinationSuggestions(
  documents: readonly MigratedEditorDocument[],
  rawQuery: string
): string[] {
  const query = normalizedSuggestionValue(rawQuery)
  if (!query) return []

  const absolute = rawQuery.trimStart().startsWith("/")
  const seen = new Set<string>()
  return documents
    .map((document, index) => ({
      document,
      index,
      rank: documentSuggestionRank(document, query)
    }))
    .filter((entry) => entry.rank !== null)
    .sort((left, right) =>
      left.rank - right.rank ||
      left.document.path.length - right.document.path.length ||
      left.document.path.localeCompare(right.document.path) ||
      left.index - right.index
    )
    .flatMap(({ document }) => {
      const path = document.path.replaceAll("\\", "/").replace(/^\/+/, "")
      const key = path.toLocaleLowerCase()
      if (!path || seen.has(key)) return []
      seen.add(key)
      return [absolute ? `/${path}` : path]
    })
    .slice(0, 20)
}

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
  const hasCaretLink = Boolean(linkRangeAtSelection(state))
  if (
    (!hasBlockSelection && state.selection.empty && !hasCaretLink)
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
  const applied = toggleInlineMark(markType)(view.state, view.dispatch)
  if (!applied) return
  dismissFloatingToolbarSelection(view)
  view.focus()
}

function dismissFloatingToolbarSelection(view: EditorView): boolean {
  const mode = selectionToolbarPluginKey.getState(view.state)?.mode ?? "floating"
  if (mode !== "floating") return false

  const blockRanges = selectedBlockInlineRanges(view.state)
  const { empty, to } = view.state.selection
  const collapseTo = blockRanges.at(-1)?.to ?? (!empty ? to : null)
  if (collapseTo === null) return false

  let transaction = view.state.tr
    .setSelection(TextSelection.create(view.state.doc, collapseTo))
    .setMeta("addToHistory", false)
  if (blockRanges.length > 0) {
    transaction = transaction.setMeta(multiBlockSelectionKey, {
      selectedBlocks: [],
      anchorBlock: null
    })
  }
  view.dispatch(transaction)
  return true
}

interface EditorViewportSnapshot {
  element: HTMLElement
  scrollLeft: number
  scrollTop: number
}

export function captureEditorViewport(view: EditorView): EditorViewportSnapshot | null {
  const element = view.dom.closest<HTMLElement>("[data-rumi-editor-canvas]")
  return element
    ? { element, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop }
    : null
}

export function focusEditorPreservingViewport(
  view: EditorView,
  snapshot: EditorViewportSnapshot | null
): void {
  view.focus()
  if (!snapshot?.element.isConnected) return
  snapshot.element.scrollLeft = snapshot.scrollLeft
  snapshot.element.scrollTop = snapshot.scrollTop
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

    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Escape") return false
        return dismissFloatingToolbarSelection(view)
      }
    },

    view(editorView) {
      const container = document.createElement("div")
      container.className = "selection-toolbar"
      container.dataset.rumiEditorOverlay = ""
      container.dataset.rumiAreaSelectionExclude = ""
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
          color: hsl(var(--foreground));
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
          color: hsl(var(--foreground)); display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 1px;
        `

        const letterA = document.createElement("span")
        letterA.textContent = "A"
        letterA.style.lineHeight = "1"

        const highlightIndicator = document.createElement("div")
        highlightIndicator.className = "highlight-indicator"
        highlightIndicator.style.cssText = `width: 14px; height: 4px; border-radius: 1px; background: var(--highlight-background);`

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
      let linkEditorSessionOpen = false
      let closeLinkEditorSession = () => {}
      if (schema.marks.link) {
        inlineGroup.appendChild(createInlineToolbarSeparator())

        const linkContainer = document.createElement("div")
        linkContainer.className = "link-toolbar-container"
        linkContainer.style.cssText = `display: flex; align-items: center; position: relative;`

        const linkBtn = document.createElement("button")
        linkButton = linkBtn
        linkBtn.className = "toolbar-button link-btn"
        linkBtn.title = "Link (⌘⇧K)"
        linkBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
        linkBtn.style.cssText = `
          width: 28px; height: 28px; border: none; background: transparent;
          border-radius: 4px; cursor: pointer; display: flex;
          align-items: center; justify-content: center; color: hsl(var(--foreground));
        `

        // Link input popup
        const linkPopup = document.createElement("div")
        linkPopup.className = "link-input-popup"
        linkPopup.style.cssText = `
          position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
          margin-top: 8px; background: hsl(var(--background)); border: 1px solid hsl(var(--border));
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 8px; display: none; width: 360px; max-width: calc(100vw - 32px);
        `
        for (const eventName of ["pointerdown", "mousedown", "mouseup", "click", "contextmenu"]) {
          linkPopup.addEventListener(eventName, (event) => event.stopPropagation())
        }

        const linkInputRow = document.createElement("div")
        linkInputRow.className = "link-input-row"
        linkInputRow.style.cssText = `display: flex; align-items: center; gap: 4px;`

        const linkTextInput = document.createElement("input")
        linkTextInput.type = "text"
        linkTextInput.className = "link-text-input"
        linkTextInput.placeholder = "Link text..."
        linkTextInput.style.cssText = `
          display: none; width: 100%; box-sizing: border-box; margin-bottom: 8px;
          padding: 6px 10px; border: 1px solid hsl(var(--input));
          border-radius: 6px; background: hsl(var(--background)); color: hsl(var(--foreground));
          font-size: 13px; outline: none;
        `

        const linkInput = document.createElement("input")
        linkInput.type = "text"
        linkInput.className = "link-url-input"
        linkInput.placeholder = "Enter URL or file path..."
        linkInput.setAttribute("aria-autocomplete", "inline")
        linkInput.style.cssText = `
          position: relative; width: 100%; box-sizing: border-box; padding: 6px 0 5px;
          border: 0; border-bottom-width: 1px; border-bottom-style: solid;
          border-bottom-color: hsl(var(--border));
          background: transparent; color: hsl(var(--foreground)); border-radius: 0; font-size: 13px;
          font-weight: 400; line-height: 18px; outline: none;
        `

        const linkInputShell = document.createElement("div")
        linkInputShell.className = "link-url-input-shell"
        linkInputShell.style.cssText = `position: relative; flex: 1; min-width: 0;`

        const linkSuggestionGhost = document.createElement("div")
        linkSuggestionGhost.className = "link-url-inline-suggestion"
        linkSuggestionGhost.setAttribute("aria-hidden", "true")
        linkSuggestionGhost.style.cssText = `
          position: absolute; inset: 0; box-sizing: border-box; overflow: hidden;
          padding: 6px 0 5px; border: 0; border-bottom: 1px solid transparent;
          pointer-events: none; white-space: pre; font-size: 13px;
          font-weight: 400; line-height: 18px;
        `
        const linkSuggestionPrefix = document.createElement("span")
        linkSuggestionPrefix.style.color = "transparent"
        const linkSuggestionSuffix = document.createElement("span")
        const linkSuggestionBeforeMatch = document.createElement("span")
        linkSuggestionBeforeMatch.className = "link-url-suggestion-muted"
        linkSuggestionBeforeMatch.style.color = "hsl(var(--muted-foreground))"
        const linkSuggestionMatch = document.createElement("span")
        linkSuggestionMatch.className = "link-url-suggestion-match"
        linkSuggestionMatch.style.color = "hsl(var(--foreground))"
        const linkSuggestionAfterMatch = document.createElement("span")
        linkSuggestionAfterMatch.className = "link-url-suggestion-muted"
        linkSuggestionAfterMatch.style.color = "hsl(var(--muted-foreground))"
        linkSuggestionSuffix.append(
          linkSuggestionBeforeMatch,
          linkSuggestionMatch,
          linkSuggestionAfterMatch
        )
        linkSuggestionGhost.append(linkSuggestionPrefix, linkSuggestionSuffix)

        const linkSuggestionStatus = document.createElement("span")
        linkSuggestionStatus.className = "sr-only link-url-suggestion-status"
        linkSuggestionStatus.setAttribute("role", "status")
        linkSuggestionStatus.setAttribute("aria-live", "polite")
        const linkSuggestionStatusId = `rumi-link-suggestion-${Math.random().toString(36).slice(2)}`
        linkSuggestionStatus.id = linkSuggestionStatusId
        linkInput.setAttribute("aria-describedby", linkSuggestionStatusId)

        linkInputShell.append(linkSuggestionGhost, linkInput, linkSuggestionStatus)

        const linkCopyBtn = document.createElement("button")
        linkCopyBtn.type = "button"
        linkCopyBtn.className = "link-copy-btn link-action-icon"
        linkCopyBtn.title = "Copy link"
        linkCopyBtn.setAttribute("aria-label", "Copy link")
        const copyIconMarkup = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
        const copiedIconMarkup = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><path d="m5 12 4 4L19 6"/></svg>`
        linkCopyBtn.innerHTML = copyIconMarkup

        const linkOpenBtn = document.createElement("button")
        linkOpenBtn.type = "button"
        linkOpenBtn.className = "link-open-btn link-action-icon"
        linkOpenBtn.title = "Open link"
        linkOpenBtn.setAttribute("aria-label", "Open link")
        linkOpenBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z"/></svg>`

        const linkUnlinkBtn = document.createElement("button")
        linkUnlinkBtn.type = "button"
        linkUnlinkBtn.className = "link-unlink-btn link-action-icon"
        linkUnlinkBtn.title = "Unlink"
        linkUnlinkBtn.setAttribute("aria-label", "Unlink")
        linkUnlinkBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/><path d="m8 2 1 3"/><path d="m2 8 3 1"/><path d="m16 19 1 3"/><path d="m19 16 3 1"/></svg>`

        const linkApplyBtn = document.createElement("button")
        linkApplyBtn.type = "button"
        linkApplyBtn.className = "link-apply-btn link-action-icon"
        linkApplyBtn.title = "Apply link"
        linkApplyBtn.setAttribute("aria-label", "Apply link")
        linkApplyBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><path d="m5 12 4 4L19 6"/></svg>`
        linkApplyBtn.style.cssText = `
          width: 28px; height: 28px; flex: 0 0 28px; padding: 0;
          background: hsl(var(--action)); color: hsl(var(--action-foreground));
          border: 1px solid hsl(var(--action));
          border-radius: 6px; cursor: pointer; display: inline-flex;
          align-items: center; justify-content: center;
        `

        linkPopup.appendChild(linkTextInput)
        linkInputRow.appendChild(linkInputShell)
        for (const actionButton of [linkCopyBtn, linkOpenBtn, linkUnlinkBtn]) {
          actionButton.style.cssText = `
            width: 28px; height: 28px; flex: 0 0 28px; padding: 0;
            background: transparent; color: hsl(var(--foreground));
            border: 1px solid hsl(var(--border));
            border-radius: 6px; cursor: pointer; display: inline-flex;
            align-items: center; justify-content: center;
          `
          actionButton.addEventListener("mousedown", preserveEditorSelection)
          linkInputRow.appendChild(actionButton)
        }
        linkInputRow.appendChild(linkApplyBtn)
        linkPopup.appendChild(linkInputRow)

        let savedSelection: {
          ranges: Array<{ from: number; to: number }>
          blockSelection: boolean
          existingText: string | null
        } | null = null
        let linkSuggestionQuery = ""
        let linkSuggestions: string[] = []
        let linkSuggestionIndex = 0
        let linkCopyFeedbackTimer: number | null = null

        const currentLinkSuggestion = () =>
          linkSuggestions[linkSuggestionIndex] ?? null

        const renderLinkSuggestion = () => {
          const suggestion = currentLinkSuggestion()
          const query = linkSuggestionQuery
          const exactValue = suggestion?.toLocaleLowerCase() === query.toLocaleLowerCase()
          if (!query || !suggestion || exactValue) {
            linkSuggestionGhost.style.display = "none"
            linkSuggestionPrefix.textContent = ""
            linkSuggestionBeforeMatch.textContent = ""
            linkSuggestionMatch.textContent = ""
            linkSuggestionAfterMatch.textContent = ""
            linkSuggestionStatus.textContent = ""
            delete linkInput.dataset.suggestion
            return
          }

          const continuesQuery = suggestion
            .toLocaleLowerCase()
            .startsWith(query.toLocaleLowerCase())
          linkSuggestionPrefix.textContent = query
          if (continuesQuery) {
            linkSuggestionBeforeMatch.textContent = suggestion.slice(query.length)
            linkSuggestionMatch.textContent = ""
            linkSuggestionAfterMatch.textContent = ""
          } else {
            const matchQuery = query.trim()
            const matchIndex = suggestion.toLocaleLowerCase().indexOf(
              matchQuery.toLocaleLowerCase()
            )
            linkSuggestionBeforeMatch.textContent = matchIndex === -1
              ? `  → ${suggestion}`
              : `  → ${suggestion.slice(0, matchIndex)}`
            linkSuggestionMatch.textContent = matchIndex === -1
              ? ""
              : suggestion.slice(matchIndex, matchIndex + matchQuery.length)
            linkSuggestionAfterMatch.textContent = matchIndex === -1
              ? ""
              : suggestion.slice(matchIndex + matchQuery.length)
          }
          linkSuggestionGhost.style.display = "block"
          linkSuggestionStatus.textContent =
            `Suggestion ${linkSuggestionIndex + 1} of ${linkSuggestions.length}: ${suggestion}. Press Tab to accept.`
          linkInput.dataset.suggestion = suggestion
        }

        const updateLinkSuggestions = () => {
          linkSuggestionQuery = linkInput.value
          const normalizedInput = linkSuggestionQuery.trim().toLocaleLowerCase()
          linkSuggestions = linkDestinationSuggestions(
            migratedEditorPlatform().documents,
            linkSuggestionQuery
          ).filter((suggestion) => suggestion.toLocaleLowerCase() !== normalizedInput)
          linkSuggestionIndex = 0
          renderLinkSuggestion()
        }

        const clearLinkSuggestions = () => {
          linkSuggestionQuery = ""
          linkSuggestions = []
          linkSuggestionIndex = 0
          renderLinkSuggestion()
        }

        const resetLinkCopyFeedback = () => {
          if (linkCopyFeedbackTimer !== null) {
            window.clearTimeout(linkCopyFeedbackTimer)
            linkCopyFeedbackTimer = null
          }
          linkCopyBtn.innerHTML = copyIconMarkup
          linkCopyBtn.title = "Copy link"
          linkCopyBtn.setAttribute("aria-label", "Copy link")
          linkCopyBtn.classList.remove("copied")
        }

        closeLinkEditorSession = () => {
          resetLinkCopyFeedback()
          linkPopup.style.display = "none"
          clearLinkSuggestions()
          savedSelection = null
          linkEditorSessionOpen = false
        }

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
          const caretLink = empty
            ? linkRangeAtSelection(editorView.state, schema.marks.link)
            : null
          if (!blockSelection && empty && !caretLink) return

          // A selected link toggles off. A caret within a link opens its URL editor.
          const linkMark = schema.marks.link
          if (!empty && isInlineMarkActive(editorView.state, linkMark)) {
            const viewport = captureEditorViewport(editorView)
            let tr = editorView.state.tr
            const ranges = blockSelection ? blockRanges : [{ from, to }]
            for (const range of ranges) {
              tr = tr.removeMark(range.from, range.to, linkMark)
            }
            if (blockSelection) tr.setMeta("multiBlockKeep", true)
            editorView.dispatch(tr)
            focusEditorPreservingViewport(editorView, viewport)
            return
          }

          // Save current selection and show popup
          savedSelection = {
            ranges: blockSelection
              ? blockRanges
              : caretLink
                ? [{ from: caretLink.from, to: caretLink.to }]
                : [{ from, to }],
            blockSelection,
            existingText: caretLink
              ? editorView.state.doc.textBetween(caretLink.from, caretLink.to)
              : null
          }
          linkEditorSessionOpen = true
          linkPopup.style.display = "block"
          linkInput.value = caretLink?.href ?? ""
          updateLinkSuggestions()
          linkTextInput.value = savedSelection.existingText ?? ""
          linkTextInput.style.display = savedSelection.existingText === null
            ? "none"
            : "block"
          setTimeout(() => {
            linkInput.focus()
            linkInput.select()
          }, 0)
        })

        linkApplyBtn.addEventListener("mousedown", preserveEditorSelection)
        linkApplyBtn.addEventListener("click", (e) => {
          e.preventDefault()
          e.stopPropagation()

          const viewport = captureEditorViewport(editorView)
          const href = normalizeLinkHref(linkInput.value)
          if (savedSelection) {
            const linkMark = schema.marks.link
            const { ranges, blockSelection, existingText } = savedSelection
            let tr = editorView.state.tr
            if (existingText !== null && ranges[0]) {
              const range = ranges[0]
              const nextText = linkTextInput.value
              if (nextText === existingText) {
                tr = tr.removeMark(range.from, range.to, linkMark)
                if (href) tr = tr.addMark(range.from, range.to, linkMark.create({ href }))
              } else {
                const retainedMarks = editorView.state.doc
                  .resolve(range.from)
                  .nodeAfter?.marks.filter((mark) => mark.type !== linkMark) ?? []
                const marks = href
                  ? [...retainedMarks, linkMark.create({ href })]
                  : retainedMarks
                tr = tr.delete(range.from, range.to)
                if (nextText) {
                  tr = tr.insert(range.from, schema.text(nextText, marks))
                }
              }
            } else {
              for (const range of ranges) {
                tr = tr.removeMark(range.from, range.to, linkMark)
              }
              if (href) {
                tr = applyInlineMarkToRanges(tr, ranges, linkMark, { href })
              }
            }
            if (blockSelection) {
              tr.setMeta("multiBlockKeep", true)
            } else if (ranges.at(-1)) {
              const selectionTo = existingText === null
                ? ranges.at(-1).to
                : ranges[0].from + linkTextInput.value.length
              const markerAtSelection = tr.doc.nodeAt(selectionTo)
              const cursorPosition = href &&
                markerAtSelection?.type.name === "link_marker"
                ? selectionTo + markerAtSelection.nodeSize
                : selectionTo
              tr = tr.setSelection(
                TextSelection.create(tr.doc, cursorPosition)
              )
            }
            editorView.dispatch(tr)
          }
          closeLinkEditorSession()
          dismissFloatingToolbarSelection(editorView)
          focusEditorPreservingViewport(editorView, viewport)
          update()
        })

        linkCopyBtn.addEventListener("click", async (event) => {
          event.preventDefault()
          event.stopPropagation()
          const href = normalizeLinkHref(linkInput.value)
          if (!href) return

          try {
            await navigator.clipboard.writeText(href)
          } catch {
            return
          }
          resetLinkCopyFeedback()
          linkCopyBtn.innerHTML = copiedIconMarkup
          linkCopyBtn.title = "Copied"
          linkCopyBtn.setAttribute("aria-label", "Copied")
          linkCopyBtn.classList.add("copied")
          linkCopyFeedbackTimer = window.setTimeout(() => {
            linkCopyFeedbackTimer = null
            closeLinkEditorSession()
            update()
          }, 100)
        })

        linkOpenBtn.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          const href = normalizeLinkHref(linkInput.value)
          if (!href) return
          openEditorHref(href, isExternalLinkHref(href) ? "new" : "current")
        })

        linkUnlinkBtn.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          linkInput.value = ""
          linkApplyBtn.click()
        })

        linkInput.addEventListener("input", updateLinkSuggestions)
        linkInput.addEventListener("keydown", (e) => {
          const acceptLinkSuggestion = () => {
            const suggestion = currentLinkSuggestion()
            if (!suggestion) return false
            linkInput.value = suggestion
            linkInput.setSelectionRange(linkInput.value.length, linkInput.value.length)
            clearLinkSuggestions()
            return true
          }
          if (e.key === "Tab" && currentLinkSuggestion()) {
            e.preventDefault()
            e.stopPropagation()
            acceptLinkSuggestion()
          } else if (
            (e.key === "ArrowDown" || e.key === "ArrowUp") &&
            !e.altKey &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.shiftKey &&
            linkSuggestions.length > 0
          ) {
            e.preventDefault()
            e.stopPropagation()
            const direction = e.key === "ArrowDown" ? 1 : -1
            linkSuggestionIndex = (
              linkSuggestionIndex + direction + linkSuggestions.length
            ) % linkSuggestions.length
            renderLinkSuggestion()
          } else if (e.key === "Enter") {
            e.preventDefault()
            acceptLinkSuggestion()
            linkApplyBtn.click()
          } else if (e.key === "Escape") {
            closeLinkEditorSession()
            dismissFloatingToolbarSelection(editorView)
            editorView.focus()
            update()
          }
        })
        linkTextInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            linkApplyBtn.click()
          } else if (e.key === "Escape") {
            closeLinkEditorSession()
            dismissFloatingToolbarSelection(editorView)
            editorView.focus()
            update()
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
      const editorOverlayHost = editorView.dom.closest<HTMLElement>(
        ".prosemirror-editor-wrapper"
      )

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
        const targetParent = mode === "floating"
          ? editorOverlayHost ?? document.body
          : document.body
        const correctlyPlaced = container.parentElement === targetParent
        if (currentMode === mode && correctlyPlaced) return
        currentMode = mode
        container.dataset.mode = mode

        if (container.parentElement !== targetParent) {
          targetParent.appendChild(container)
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
        const linkEditorRequested = Boolean(
          linkButton &&
          preferences.linkEditorRequestRevision > handledLinkEditorRequestRevision
        )
        const caretLink = empty
          ? linkRangeAtSelection(state, schema.marks.link)
          : null
        const hasTextSelection = !empty && from !== to && !(selection instanceof NodeSelection)
        const textSelectionInCode = hasTextSelection && selection.$from.parent.type.spec.code
        const forceLinkEditor = (linkEditorRequested || linkEditorSessionOpen) && Boolean(
          caretLink ||
          hasBlockSelection ||
          (hasTextSelection && !textSelectionInCode)
        )
        const presentationMode = mode === "none" && forceLinkEditor
          ? "floating"
          : mode

        placeContainer(presentationMode)
        container.classList.toggle(
          "link-editor-only",
          forceLinkEditor && !hasTextSelection && !hasBlockSelection
        )
        container.toggleAttribute(
          "data-rumi-preserve-block-selection",
          isExpandedEditorToolbarMode(mode)
        )

        if (linkEditorSessionOpen && !forceLinkEditor) {
          closeLinkEditorSession()
        }

        if ((mode === "none" && !forceLinkEditor) || !editorView.editable) {
          container.style.display = "none"
          return
        }

        if (
          presentationMode === "floating" &&
          !forceLinkEditor &&
          (!hasBlockSelection && (!hasTextSelection || textSelectionInCode))
        ) {
          container.style.display = "none"
          return
        }

        container.style.display = "flex"
        if (presentationMode === "floating") {
          clearEditorToolbarBounds()
          const selectedRects = blockRanges.flatMap((range) => {
            const dom = editorView.nodeDOM(range.from - 1)
            return dom instanceof HTMLElement ? [dom.getBoundingClientRect()] : []
          })
          const start = hasBlockSelection
            ? null
            : editorView.coordsAtPos(caretLink?.from ?? from)
          const end = hasBlockSelection
            ? null
            : editorView.coordsAtPos(caretLink?.to ?? to)
          const leftEdge = selectedRects.length > 0
            ? Math.min(...selectedRects.map((rect) => rect.left))
            : Math.min(start?.left ?? 10, end?.left ?? 10)
          const rightEdge = selectedRects.length > 0
            ? Math.max(...selectedRects.map((rect) => rect.right))
            : Math.max(start?.left ?? 10, end?.left ?? 10)
          const selectionBottom = selectedRects.length > 0
            ? Math.max(...selectedRects.map((rect) => rect.bottom))
            : Math.max(start?.bottom ?? 10, end?.bottom ?? 10)
          const toolbarWidth = container.offsetWidth
          const hostRect = editorOverlayHost?.getBoundingClientRect()
          const originLeft = hostRect?.left ?? -window.scrollX
          const originTop = hostRect?.top ?? -window.scrollY
          const horizontalScroll = editorOverlayHost ? 0 : window.scrollX
          const availableWidth = hostRect && hostRect.width > 0
            ? hostRect.width
            : window.innerWidth
          const centeredLeft = (
            leftEdge - originLeft + rightEdge - originLeft - toolbarWidth
          ) / 2
          const minimumLeft = horizontalScroll + 10
          const maximumLeft = horizontalScroll + availableWidth - toolbarWidth - 10
          container.style.left = `${Math.max(
            minimumLeft,
            Math.min(centeredLeft, maximumLeft)
          )}px`
          container.style.top = `${selectionBottom - originTop + 8}px`
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
            button.style.background = isInlineMarkActive(state, markType) ? "hsl(var(--accent))" : "transparent"
          }
        })

        // Update highlight button
        const highlightBtn = container.querySelector(".highlight-btn") as HTMLElement
        if (highlightBtn && schema.marks.highlight) {
          const markType = schema.marks.highlight
          highlightBtn.style.background = isInlineMarkActive(state, markType) ? "hsl(var(--accent))" : "transparent"
        }

        // Update link button
        const linkBtn = container.querySelector(".link-btn") as HTMLElement
        if (linkBtn && schema.marks.link) {
          const markType = schema.marks.link
          linkBtn.style.background = isInlineMarkActive(state, markType) ? "hsl(var(--accent))" : "transparent"
        }
      }

      // Close the toolbar on outside click (capture phase to catch all clicks)
      const handleOutsideClick = (e: MouseEvent) => {
        // If click is inside the toolbar, let it handle normally
        if (
          container.contains(e.target as Node) ||
          e.composedPath().includes(container)
        ) return

        // Close link popup
        closeLinkEditorSession()

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
        update()
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
          closeLinkEditorSession()
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

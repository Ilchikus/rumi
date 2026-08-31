// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, TextSelection, type Command } from "prosemirror-state"
import { Decoration, DecorationSet, EditorView } from "prosemirror-view"
import { Schema } from "prosemirror-model"
import { openEditorHref } from "../platform"
import {
  isExternalLinkHref,
  isLinkDestination,
  normalizeLinkHref
} from "../linkHref"
import { mentionKindForPath } from "../mentionTypes"
import { linkRangeAtPosition } from "../linkSelection"
import { openSelectionToolbarLinkEditor } from "./selectionToolbar"

export const linkPluginKey = new PluginKey("link")
const COMMAND_LINK_MODE_CLASS = "rumi-command-link-mode"
const LINK_ICON_SELECTOR = "[data-rumi-link-icon]"
const LINK_MARKER_RECONCILE_META = "rumiLinkMarkerReconcile"

export function unlinkSelectedLinkMarker(schema: Schema): Command {
  return (state, dispatch) => {
    const marker = selectedLinkMarker(state)
    return marker
      ? unlinkLinkMarker(state, schema, marker, dispatch)
      : false
  }
}

export function linkPlugin(schema: Schema) {
  if (
    !schema.marks.link ||
    !schema.nodes.link_marker
  ) {
    return new Plugin({ key: linkPluginKey })
  }
  let secondaryMouseDownOpen: { target: EventTarget | null; at: number } | null = null

  return new Plugin({
    key: linkPluginKey,

    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          if (!closestLink(event.target) && !closestLinkIcon(event.target)) return false

          event.preventDefault()
          const precedingMouseDown = secondaryMouseDownOpen
          secondaryMouseDownOpen = null
          if (
            precedingMouseDown?.target === event.target &&
            Date.now() - precedingMouseDown.at < 1_000
          ) {
            return true
          }
          openLinkEditorForEventTarget(view, event.target)
          return true
        },

        mousedown(view, event) {
          const icon = closestLinkIcon(event.target)
          const link = closestLink(event.target)

          // The app suppresses native secondary-button selection on mousedown.
          // Open here so browsers that consequently omit `contextmenu` still
          // provide the Rumi link editor. The contextmenu handler remains for
          // keyboard/browser paths that emit it directly.
          if (isSecondaryContextGesture(event)) {
            if (!link && !icon) return false
            event.preventDefault()
            secondaryMouseDownOpen = { target: event.target, at: Date.now() }
            openLinkEditorForEventTarget(view, event.target)
            return true
          }

          secondaryMouseDownOpen = null
          if (
            event.button === 0 &&
            link &&
            (event.metaKey || event.ctrlKey || event.shiftKey)
          ) {
            event.preventDefault()
            return true
          }
          if (event.button !== 0 || !icon) return false

          event.preventDefault()
          return true
        },

        click(view, event) {
          const icon = closestLinkIcon(event.target)
          const link = closestLink(event.target)
          if (
            event.button !== 0 ||
            isSecondaryContextGesture(event)
          ) return false

          if (icon) {
            event.preventDefault()
            return activateLinkIcon(view, icon, event)
          }
          if (link && (event.metaKey || event.ctrlKey || event.shiftKey)) {
            event.preventDefault()
            return activateLinkAnchor(link, event)
          }
          return false
        }
      },

      handleClick(view, pos, event) {
        const link = closestLink(event.target)
        if (!link || event.button !== 0 || isSecondaryContextGesture(event)) return false

        event.preventDefault()
        const href = normalizeLinkHref(link.getAttribute("href") ?? "")
        const intent = linkClickIntent(link, event)

        if (intent === "caret") {
          const transaction = view.state.tr
            .setSelection(TextSelection.near(view.state.doc.resolve(pos)))
            .setMeta("addToHistory", false)

          view.dispatch(transaction)
          view.focus()
          return true
        }

        if (href) openEditorHref(href, intent === "new-tab" ? "new" : "current")
        return true
      },

      handleKeyDown(view, event) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false

        if (!view.state.selection.empty) {
          if (event.key !== "Backspace") return false
          const unlinked = unlinkSelectedLinkMarker(schema)(
            view.state,
            view.dispatch,
            view
          )
          if (!unlinked) return false
          event.preventDefault()
          view.focus()
          return true
        }

        const selectionPosition = view.state.selection.from
        const markerBefore = linkMarkerBefore(view.state, selectionPosition)

        if (event.key === "Backspace" && markerBefore) {
          const unlinked = unlinkLinkMarker(
            view.state,
            schema,
            markerBefore,
            view.dispatch
          )
          if (!unlinked) return false
          event.preventDefault()
          view.focus()
          return true
        }

        if (event.key === "ArrowLeft" && markerBefore) {
          const range = linkRangeForMarker(view.state, markerBefore.pos)
          if (!range) return false

          event.preventDefault()
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.create(view.state.doc, markerBefore.pos))
              .setStoredMarks(null)
              .setMeta("addToHistory", false)
          )
          return true
        }

        const markerAfter = linkMarkerAt(view.state, selectionPosition)
        if (event.key === "ArrowRight" && markerAfter) {
          const range = linkRangeForMarker(view.state, selectionPosition)
          if (!range) return false
          event.preventDefault()
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.create(
                view.state.doc,
                selectionPosition + markerAfter.nodeSize
              ))
              .setStoredMarks(
                view.state.doc.resolve(range.from).nodeAfter?.marks ?? null
              )
              .setMeta("addToHistory", false)
          )
          return true
        }

        return false
      },

      handlePaste(view, event) {
        const { from, to, empty } = view.state.selection
        if (empty) return false

        const clipboardText = event.clipboardData?.getData("text/plain")
        if (!clipboardText) return false

        if (isLinkDestination(clipboardText)) {
          event.preventDefault()

          const href = normalizeLinkHref(clipboardText)
          let transaction = view.state.tr
            .addMark(from, to, schema.marks.link.create({ href }))
          transaction = transaction.setSelection(TextSelection.create(transaction.doc, to))
          view.dispatch(transaction)
          return true
        }

        return false
      },

      decorations(state) {
        const decorations: Decoration[] = []
        const { selection } = state

        if (selection.empty && linkMarkerAt(state, selection.from)) {
          decorations.push(
            Decoration.widget(selection.from, createLinkBoundaryCaret, {
              key: "rumi-link-boundary-caret",
              side: -1
            })
          )
        }

        if (!selection.empty) {
          state.doc.descendants((node, position) => {
            if (!isLinkMarker(node)) return
            const range = linkRangeForMarker(state, position)
            if (!range) return
            const markerSelected =
              selection.from <= position &&
              selection.to >= position + node.nodeSize
            if (!markerSelected) return
            decorations.push(
              Decoration.node(position, position + node.nodeSize, {
                class: "rumi-link-icon-selected"
              })
            )
          })
        }

        return decorations.length > 0
          ? DecorationSet.create(state.doc, decorations)
          : null
      }
    },

    appendTransaction(transactions, _oldState, newState) {
      if (
        transactions.some((transaction) => transaction.docChanged) &&
        !transactions.every((transaction) => transaction.getMeta(LINK_MARKER_RECONCILE_META))
      ) {
        const markerTransaction = reconcileLinkMarkers(newState, schema)
        if (markerTransaction) return markerTransaction
      }

      return preserveLinkAnchorEditing(newState, schema)
    },

    view(editorView) {
      const editorContainer = editorView.dom.closest(".prosemirror-editor") ?? editorView.dom

      const setCommandLinkMode = (active: boolean) => {
        editorContainer.classList.toggle(COMMAND_LINK_MODE_CLASS, active)
      }
      const hasLinkActivationModifier = (event: KeyboardEvent | MouseEvent) =>
        event.metaKey || event.ctrlKey || event.shiftKey
      const handleModifierKeyDown = (event: KeyboardEvent) => {
        if (
          hasLinkActivationModifier(event) ||
          event.key === "Meta" ||
          event.key === "Control" ||
          event.key === "Shift"
        ) setCommandLinkMode(true)
      }
      const handleModifierKeyUp = (event: KeyboardEvent) => {
        setCommandLinkMode(hasLinkActivationModifier(event))
      }
      const handleModifierMouseMove = (event: MouseEvent) => {
        setCommandLinkMode(hasLinkActivationModifier(event))
      }
      const clearCommandLinkMode = () => setCommandLinkMode(false)
      const editorDom = editorView.dom
      const syncLinkBoundaryCaret = () => {
        const boundaryActive = Boolean(
          editorView.state.selection.empty &&
          linkMarkerAt(editorView.state, editorView.state.selection.from)
        )
        editorDom.classList.toggle(
          "rumi-link-boundary-native-caret-hidden",
          boundaryActive
        )
        if (!boundaryActive) return

        const caret = editorDom.querySelector<HTMLElement>(
          ".rumi-link-boundary-caret"
        )
        const typography = caret?.parentElement
        if (!caret || !typography) return
        const fontSize = window.getComputedStyle(typography).fontSize
        if (Number.isFinite(Number.parseFloat(fontSize))) {
          caret.style.height = fontSize
        }
      }
      const handleSuppressedSecondaryMouseDown = (event: MouseEvent) => {
        if (!event.defaultPrevented || !isSecondaryContextGesture(event)) return
        if (!closestLink(event.target) && !closestLinkIcon(event.target)) return

        secondaryMouseDownOpen = { target: event.target, at: Date.now() }
        openLinkEditorForEventTarget(editorView, event.target)
      }

      editorDom.addEventListener("mousedown", handleSuppressedSecondaryMouseDown, true)
      editorDom.addEventListener("mousemove", handleModifierMouseMove)
      document.addEventListener("keydown", handleModifierKeyDown, true)
      document.addEventListener("keyup", handleModifierKeyUp, true)
      window.addEventListener("blur", clearCommandLinkMode)
      syncLinkBoundaryCaret()

      return {
        update() {
          syncLinkBoundaryCaret()
        },
        destroy() {
          clearCommandLinkMode()
          editorDom.classList.remove("rumi-link-boundary-native-caret-hidden")
          editorDom.removeEventListener("mousedown", handleSuppressedSecondaryMouseDown, true)
          editorDom.removeEventListener("mousemove", handleModifierMouseMove)
          document.removeEventListener("keydown", handleModifierKeyDown, true)
          document.removeEventListener("keyup", handleModifierKeyUp, true)
          window.removeEventListener("blur", clearCommandLinkMode)
        }
      }
    }
  })
}

function reconcileLinkMarkers(state, schema: Schema) {
  const markerType = schema.nodes.link_marker
  const linkType = schema.marks.link
  if (!markerType || !linkType) return null

  const expected = new Map<number, {
    attrs: { href: string; linkType: "external" | "internal"; mentionKind: string }
  }>()
  state.doc.descendants((node, position) => {
    if (!node.isText) return

    const mark = linkType.isInSet(node.marks)
    if (!mark) return

    const sourceHref = String(mark.attrs.href ?? "")
    const href = normalizeLinkHref(sourceHref)
    const previousMark = linkType.isInSet(
      state.doc.resolve(position).nodeBefore?.marks ?? []
    )
    if (
      previousMark &&
      normalizeLinkHref(String(previousMark.attrs.href ?? "")) === href
    ) return
    const markerBefore = linkMarkerBefore(state, position)
    const markerPosition = markerBefore?.pos ?? position

    if (isExternalLinkHref(href)) {
      expected.set(markerPosition, {
        attrs: { href, linkType: "external", mentionKind: "page" }
      })
      return
    }

    expected.set(markerPosition, {
      attrs: {
        href: sourceHref,
        linkType: "internal",
        mentionKind: mark.attrs.mentionKind ?? mentionKindForPath(sourceHref)
      }
    })
  })

  const operations: Array<{
    kind: "delete" | "insert" | "replace"
    pos: number
    nodeSize?: number
    attrs?: { href: string; linkType: "external" | "internal"; mentionKind: string }
  }> = []
  state.doc.descendants((node, position) => {
    if (node.type !== markerType) return

    const expectedMarker = expected.get(position)
    if (!expectedMarker) {
      operations.push({ kind: "delete", pos: position, nodeSize: node.nodeSize })
      return
    }

    expected.delete(position)
    if (
      normalizeLinkHref(String(node.attrs.href ?? "")) !==
        normalizeLinkHref(expectedMarker.attrs.href) ||
      node.attrs.linkType !== expectedMarker.attrs.linkType ||
      node.attrs.mentionKind !== expectedMarker.attrs.mentionKind
    ) {
      operations.push({
        kind: "replace",
        pos: position,
        nodeSize: node.nodeSize,
        ...expectedMarker
      })
    }
  })
  for (const [position, marker] of expected) {
    operations.push({ kind: "insert", pos: position, ...marker })
  }
  if (operations.length === 0) return null

  operations.sort((left, right) => right.pos - left.pos)
  let transaction = state.tr
  for (const operation of operations) {
    if (operation.kind === "delete") {
      transaction = transaction.delete(
        operation.pos,
        operation.pos + (operation.nodeSize ?? 1)
      )
    } else if (operation.kind === "replace") {
      transaction = transaction.replaceWith(
        operation.pos,
        operation.pos + (operation.nodeSize ?? 1),
        markerType.create(operation.attrs)
      )
    } else {
      transaction = transaction.insert(
        operation.pos,
        markerType.create(operation.attrs)
      )
    }
  }

  return transaction
    .setMeta(LINK_MARKER_RECONCILE_META, true)
    .setMeta("addToHistory", false)
}

function preserveLinkAnchorEditing(state, schema: Schema) {
  if (!state.selection.empty) return null

  const markerBefore = linkMarkerBefore(state, state.selection.from)
  if (!markerBefore) return null

  const range = linkRangeForMarker(state, markerBefore.pos)
  if (!range) return null

  const anchorMarks = state.doc.resolve(range.from).nodeAfter?.marks ?? []
  const linkMark = schema.marks.link.isInSet(anchorMarks)
  if (!linkMark || schema.marks.link.isInSet(state.storedMarks ?? [])) return null

  const storedMarks = state.storedMarks
    ? [...state.storedMarks, linkMark]
    : anchorMarks
  return state.tr
    .setStoredMarks(storedMarks)
    .setMeta("addToHistory", false)
}

function linkMarkerAt(state, position: number) {
  const node = state.doc.nodeAt(position)
  return node?.type.name === "link_marker" ? node : null
}

function linkMarkerBefore(state, position: number) {
  if (position <= 0) return null
  const pos = position - 1
  const node = linkMarkerAt(state, pos)
  return node ? { node, pos } : null
}

function selectedLinkMarker(state) {
  const { empty, from, to } = state.selection
  if (empty) return null

  const node = linkMarkerAt(state, from)
  return node && to === from + node.nodeSize
    ? { node, pos: from }
    : null
}

function unlinkLinkMarker(state, schema: Schema, marker, dispatch): boolean {
  const range = linkRangeForMarker(state, marker.pos)
  if (!range) return false

  let transaction = state.tr
    .removeMark(range.from, range.to, schema.marks.link)
    .delete(marker.pos, marker.pos + marker.node.nodeSize)
  transaction = transaction
    .setSelection(TextSelection.create(
      transaction.doc,
      range.from - marker.node.nodeSize
    ))
    .setMeta(LINK_MARKER_RECONCILE_META, true)
  dispatch?.(transaction)
  return true
}

function linkRangeForMarker(state, markerPosition: number) {
  const marker = linkMarkerAt(state, markerPosition)
  if (!marker) return null

  const range = linkRangeAtPosition(
    state,
    markerPosition + marker.nodeSize
  )
  const expectedExternal = marker.attrs.linkType === "external"
  return range &&
    range.from === markerPosition + marker.nodeSize &&
    isExternalLinkHref(range.href) === expectedExternal
    ? range
    : null
}

function isLinkMarker(node): boolean {
  return node?.type.name === "link_marker"
}

function createLinkBoundaryCaret(): HTMLElement {
  const caret = document.createElement("span")
  caret.className = "rumi-link-boundary-caret"
  caret.contentEditable = "false"
  caret.setAttribute("aria-hidden", "true")
  return caret
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

function closestLinkIcon(target: EventTarget | null): HTMLElement | null {
  const candidate = target as { closest?: (selector: string) => Element | null } | null
  return typeof candidate?.closest === "function"
    ? candidate.closest(LINK_ICON_SELECTOR) as HTMLElement | null
    : null
}

function linkMarkerPositionForDom(
  view: EditorView,
  icon: HTMLElement
): number | null {
  try {
    const position = view.posAtDOM(icon, 0)
    if (linkMarkerAt(view.state, position)) return position
    return linkMarkerBefore(view.state, position)?.pos ?? null
  } catch {
    return null
  }
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

function openLinkEditorForEventTarget(
  view: EditorView,
  target: EventTarget | null
): boolean {
  const link = closestLink(target)
  if (link) return openLinkEditorForDomLink(view, link)

  const icon = closestLinkIcon(target)
  const markerPosition = icon
    ? linkMarkerPositionForDom(view, icon)
    : null
  return markerPosition === null
    ? false
    : openLinkEditorAtPosition(view, markerPosition)
}

function openLinkEditorAtPosition(view: EditorView, position: number): boolean {
  const directRange = linkRangeAtPosition(view.state, position)
  const markerAt = linkMarkerAt(view.state, position)
  const markerBefore = linkMarkerBefore(view.state, position)
  const range = directRange ?? (
    markerAt
      ? linkRangeForMarker(view.state, position)
      : markerBefore
        ? linkRangeForMarker(view.state, markerBefore.pos)
        : null
  )
  if (!range) return false

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, range.from))
      .setMeta("addToHistory", false)
  )
  return openSelectionToolbarLinkEditor(view.state, view.dispatch)
}

function activateLinkIcon(
  _view: EditorView,
  icon: HTMLElement,
  event: MouseEvent
): boolean {
  const href = icon.dataset.href?.trim() ?? ""
  if (!href) return true

  const intent = linkIconClickIntent(href, event)
  openEditorHref(href, intent === "new-tab" ? "new" : "current")
  return true
}

function activateLinkAnchor(link: Element, event: MouseEvent): boolean {
  const href = normalizeLinkHref(link.getAttribute("href") ?? "")
  if (!href) return true

  const intent = linkClickIntent(link, event)
  if (intent !== "caret") {
    openEditorHref(href, intent === "new-tab" ? "new" : "current")
  }
  return true
}

export type LinkClickIntent = "caret" | "current-tab" | "new-tab"

export function linkClickIntent(_link: Element, event: MouseEvent): LinkClickIntent {
  if (event.metaKey || event.ctrlKey) return "new-tab"
  if (event.shiftKey) return "current-tab"
  return "caret"
}

export function linkIconClickIntent(
  href: string,
  event: MouseEvent
): Exclude<LinkClickIntent, "caret"> {
  if (event.metaKey || event.ctrlKey) return "new-tab"
  if (event.shiftKey) return "current-tab"
  return isExternalLinkHref(href) ? "new-tab" : "current-tab"
}

// Helper function to add a link to selected text (used by selection toolbar)
export function addLinkToSelection(view: EditorView, href: string) {
  const { from, to } = view.state.selection
  if (from === to) return false

  const linkMark = view.state.schema.marks.link
  if (!linkMark) return false

  const normalizedHref = normalizeLinkHref(href)
  let transaction = view.state.tr
    .addMark(from, to, linkMark.create({ href: normalizedHref }))
  transaction = transaction.setSelection(TextSelection.create(transaction.doc, to))
  view.dispatch(transaction)
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

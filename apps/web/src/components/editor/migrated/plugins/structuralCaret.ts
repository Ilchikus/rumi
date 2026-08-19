import { Plugin, NodeSelection, Selection, TextSelection } from "prosemirror-state"
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view"
import {
  StructuralCaretSelection,
  setMermaidEditSelection,
  structuralCaretAtBlock,
  structuralCaretContext,
  supportsStructuralCaret,
  type StructuralCaretSide
} from "../structuralCaretSelection"
import { transactionLeavesEditorInactive } from "../inactiveBlockSelection"
import { createDeleteBlocksTransaction } from "./multiBlockSelection"

function dispatchStructuralCaret(
  view: EditorView,
  nodePos: number,
  side: StructuralCaretSide
): boolean {
  view.dispatch(
    view.state.tr
      .setSelection(structuralCaretAtBlock(view.state.doc, nodePos, side))
      .scrollIntoView()
  )
  return true
}

function dispatchMermaidCaret(
  view: EditorView,
  nodePos: number,
  side: StructuralCaretSide
): boolean {
  const node = view.state.doc.nodeAt(nodePos)
  if (!node || node.type.name !== "mermaid") return false
  const transaction = view.state.tr
  setMermaidEditSelection(transaction, nodePos, side)
  view.dispatch(transaction.scrollIntoView())
  return true
}

function moveFromStructuralCaret(view: EditorView, direction: -1 | 1): boolean {
  const selection = view.state.selection
  if (!(selection instanceof StructuralCaretSelection)) return false
  const context = structuralCaretContext(selection.$head, selection.side)
  if (!context) return false

  if (direction > 0 && selection.side === "before") {
    return dispatchStructuralCaret(view, context.nodePos, "after")
  }
  if (direction < 0 && selection.side === "after") {
    return dispatchStructuralCaret(view, context.nodePos, "before")
  }

  const $pos = selection.$head
  const adjacent = direction > 0 ? $pos.nodeAfter : $pos.nodeBefore
  if (adjacent?.type.name === "mermaid") {
    const nodePos = direction > 0 ? $pos.pos : $pos.pos - adjacent.nodeSize
    return dispatchMermaidCaret(
      view,
      nodePos,
      direction > 0 ? "before" : "after"
    )
  }
  if (supportsStructuralCaret(adjacent)) {
    const nodePos = direction > 0 ? $pos.pos : $pos.pos - adjacent!.nodeSize
    return dispatchStructuralCaret(
      view,
      nodePos,
      direction > 0 ? "before" : "after"
    )
  }

  const found = Selection.findFrom($pos, direction, true)
  if (!found) return false
  view.dispatch(view.state.tr.setSelection(found).scrollIntoView())
  return true
}

function enterStructuralCaret(
  view: EditorView,
  direction: -1 | 1,
  axis: "horizontal" | "vertical"
): boolean {
  const { selection } = view.state
  if (selection instanceof StructuralCaretSelection) {
    return moveFromStructuralCaret(view, direction)
  }

  if (selection instanceof NodeSelection) {
    const node = view.state.doc.nodeAt(selection.from)
    if (node?.type.name === "mermaid") {
      return dispatchMermaidCaret(
        view,
        selection.from,
        direction > 0 ? "after" : "before"
      )
    }
    if (!supportsStructuralCaret(node)) return false
    return dispatchStructuralCaret(
      view,
      selection.from,
      direction > 0 ? "after" : "before"
    )
  }

  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const directionName = axis === "horizontal"
    ? direction > 0 ? "right" : "left"
    : direction > 0 ? "down" : "up"
  if (!view.endOfTextblock(directionName)) return false

  const $head = selection.$head
  if ($head.depth < 1) return false
  const boundaryPos = direction > 0 ? $head.after(1) : $head.before(1)
  const $boundary = view.state.doc.resolve(boundaryPos)
  const adjacent = direction > 0 ? $boundary.nodeAfter : $boundary.nodeBefore
  if (adjacent?.type.name === "mermaid") {
    const nodePos = direction > 0
      ? boundaryPos
      : boundaryPos - adjacent.nodeSize
    return dispatchMermaidCaret(
      view,
      nodePos,
      direction > 0 ? "before" : "after"
    )
  }
  if (!supportsStructuralCaret(adjacent)) return false
  const nodePos = direction > 0
    ? boundaryPos
    : boundaryPos - adjacent!.nodeSize
  return dispatchStructuralCaret(
    view,
    nodePos,
    direction > 0 ? "before" : "after"
  )
}

function deleteAtStructuralCaret(view: EditorView, key: "Backspace" | "Delete") {
  const selection = view.state.selection
  if (!(selection instanceof StructuralCaretSelection)) return false
  if (selection.side === "before" && key !== "Delete") return false

  const context = structuralCaretContext(selection.$head, selection.side)
  if (!context) return false
  const transaction = createDeleteBlocksTransaction(
    view.state,
    [context.nodePos]
  )
  if (!transaction) return false
  view.dispatch(transaction)
  if (!transactionLeavesEditorInactive(transaction)) view.focus()
  return true
}

export function structuralCaretPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const selection = state.selection
        if (!(selection instanceof StructuralCaretSelection)) return null
        const context = structuralCaretContext(selection.$head, selection.side)
        if (!context) return null
        return DecorationSet.create(state.doc, [
          Decoration.node(
            context.nodePos,
            context.nodePos + context.node.nodeSize,
            { class: `rumi-structural-caret-${selection.side}` }
          )
        ])
      },

      handleKeyDown(view, event) {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey
        ) return false
        switch (event.key) {
          case "ArrowLeft":
            return enterStructuralCaret(view, -1, "horizontal")
          case "ArrowRight":
            return enterStructuralCaret(view, 1, "horizontal")
          case "ArrowUp":
            return enterStructuralCaret(view, -1, "vertical")
          case "ArrowDown":
            return enterStructuralCaret(view, 1, "vertical")
          case "Backspace":
          case "Delete":
            return deleteAtStructuralCaret(view, event.key)
          default:
            return false
        }
      }
    }
  })
}

import { Plugin, TextSelection, type EditorState } from "prosemirror-state"

function mermaidPositionAt(
  position: EditorState["selection"]["$head"]
): number | null {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    if (position.node(depth).type.name === "mermaid") {
      return position.before(depth)
    }
  }
  return null
}

function mermaidSelectionPosition(state: EditorState): number | null {
  const { selection } = state
  if (!(selection instanceof TextSelection)) return null
  return mermaidPositionAt(selection.$head) ??
    mermaidPositionAt(selection.$anchor)
}

function mermaidCaretPosition(state: EditorState): number | null {
  return state.selection.empty ? mermaidSelectionPosition(state) : null
}

function mapPositionThroughTransactions(
  position: number,
  transactions: readonly import("prosemirror-state").Transaction[]
): number {
  return transactions.reduce(
    (mappedPosition, transaction) =>
      transaction.mapping.map(mappedPosition, 1),
    position
  )
}

export function mermaidModePlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      // Mode follows caret movement only. Attribute-only updates such as the
      // toolbar's explicit View/Edit buttons are left entirely alone.
      if (!transactions.some((transaction) => transaction.selectionSet)) {
        return null
      }

      // Shift-Arrow and other range-selection gestures retain ordinary
      // ProseMirror behavior. View mode follows only a collapsed caret.
      if (
        !(newState.selection instanceof TextSelection) ||
        !newState.selection.empty
      ) return null

      const previousPosition = mermaidSelectionPosition(oldState)
      if (previousPosition === null) return null

      const mappedPreviousPosition = mapPositionThroughTransactions(
        previousPosition,
        transactions
      )
      if (mermaidCaretPosition(newState) === mappedPreviousPosition) return null

      const previousMermaid = newState.doc.nodeAt(mappedPreviousPosition)
      if (
        !previousMermaid ||
        previousMermaid.type.name !== "mermaid" ||
        previousMermaid.attrs.mode !== "edit"
      ) return null

      return newState.tr
        .setNodeMarkup(mappedPreviousPosition, undefined, {
          ...previousMermaid.attrs,
          mode: "view"
        })
        .setMeta("addToHistory", false)
    }
  })
}

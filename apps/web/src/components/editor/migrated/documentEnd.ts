import {
  TextSelection,
  type EditorState,
  type Transaction
} from "prosemirror-state"
import { createCollapsedHeadingExitAtDocumentEndTransaction } from "./plugins/collapsibleHeadings"

export function createDocumentEndClickTransaction(
  state: EditorState
): Transaction | null {
  const collapsedExit =
    createCollapsedHeadingExitAtDocumentEndTransaction(state)
  if (collapsedExit) return collapsedExit

  const paragraph = state.schema.nodes.paragraph
  if (!paragraph) return null

  const { doc } = state
  const lastNode = doc.lastChild
  const lastNodePos = doc.content.size - (lastNode?.nodeSize || 0)

  if (
    lastNode?.type === paragraph &&
    lastNode.content.size === 0
  ) {
    return state.tr
      .setSelection(TextSelection.create(doc, lastNodePos + 1))
      .scrollIntoView()
  }

  const insertPos = doc.content.size
  const transaction = state.tr.insert(insertPos, paragraph.create())
  return transaction
    .setSelection(TextSelection.create(transaction.doc, insertPos + 1))
    .scrollIntoView()
}

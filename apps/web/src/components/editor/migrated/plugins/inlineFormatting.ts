import { toggleMark } from "prosemirror-commands"
import type { MarkType } from "prosemirror-model"
import type { Command, EditorState, Transaction } from "prosemirror-state"
import { multiBlockSelectionKey } from "./multiBlockSelection"

export interface InlineFormattingRange {
  from: number
  to: number
}

export function selectedBlockInlineRanges(
  state: EditorState
): InlineFormattingRange[] {
  const selectedBlocks = multiBlockSelectionKey.getState(state)?.selectedBlocks ?? []

  return [...new Set(selectedBlocks)]
    .sort((left, right) => left - right)
    .flatMap((pos) => {
      const node = state.doc.nodeAt(pos)
      if (!node || node.content.size === 0) return []
      return [{ from: pos + 1, to: pos + node.nodeSize - 1 }]
    })
}

export function isInlineMarkActive(state: EditorState, markType: MarkType): boolean {
  const ranges = selectedBlockInlineRanges(state)
  if (ranges.length === 0) {
    const { from, $from, to, empty } = state.selection
    if (empty) return Boolean(markType.isInSet(state.storedMarks ?? $from.marks()))
    return state.doc.rangeHasMark(from, to, markType)
  }

  return markCoverage(state, ranges, markType).allMarked
}

export function toggleInlineMark(markType: MarkType): Command {
  const regularToggle = toggleMark(markType)

  return (state, dispatch) => {
    const ranges = selectedBlockInlineRanges(state)
    if (ranges.length === 0) return regularToggle(state, dispatch)

    const coverage = markCoverage(state, ranges, markType)
    if (!coverage.hasMarkableContent) return false

    if (dispatch) {
      let transaction = state.tr
      for (const range of ranges) {
        transaction = coverage.allMarked
          ? transaction.removeMark(range.from, range.to, markType)
          : transaction.addMark(range.from, range.to, markType.create())
      }
      transaction.setMeta("multiBlockKeep", true)
      dispatch(transaction.scrollIntoView())
    }
    return true
  }
}

export function applyInlineMarkToRanges(
  transaction: Transaction,
  ranges: readonly InlineFormattingRange[],
  markType: MarkType,
  attrs?: Record<string, unknown>
): Transaction {
  for (const range of ranges) {
    transaction = transaction.addMark(range.from, range.to, markType.create(attrs))
  }
  return transaction
}

function markCoverage(
  state: EditorState,
  ranges: readonly InlineFormattingRange[],
  markType: MarkType
): { hasMarkableContent: boolean; allMarked: boolean } {
  let hasMarkableContent = false
  let allMarked = true

  for (const range of ranges) {
    state.doc.nodesBetween(range.from, range.to, (node, _pos, parent) => {
      if (!node.isText || !parent?.type.allowsMarkType(markType)) return
      hasMarkableContent = true
      if (!markType.isInSet(node.marks)) allMarked = false
    })
  }

  return { hasMarkableContent, allMarked: hasMarkableContent && allMarked }
}

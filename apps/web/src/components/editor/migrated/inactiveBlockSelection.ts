import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction
} from "prosemirror-state"
import type { EditorView } from "prosemirror-view"

export const INACTIVE_BLOCK_SELECTION_CLASS = "rumi-inactive-block-selection"
export const inactiveBlockSelectionKey = new PluginKey<boolean>(
  "inactiveBlockSelection"
)

const CARETLESS_BOUNDARY_BLOCKS = new Set([
  "database_embed",
  "file_embed",
  "horizontal_rule"
])

export function createCaretlessBlankBlockDeletionTransaction(
  state: EditorState,
  blockPos: number
): Transaction | null {
  const block = state.doc.nodeAt(blockPos)
  if (
    !block ||
    block.type !== state.schema.nodes.paragraph ||
    block.content.size !== 0
  ) return null

  const previousNode = state.doc.resolve(blockPos).nodeBefore
  if (!previousNode || !CARETLESS_BOUNDARY_BLOCKS.has(previousNode.type.name)) {
    return null
  }

  const previousPos = blockPos - previousNode.nodeSize
  const transaction = state.tr.delete(blockPos, blockPos + block.nodeSize)
  transaction.setSelection(NodeSelection.create(transaction.doc, previousPos))
  transaction.setMeta(inactiveBlockSelectionKey, true)
  return transaction.scrollIntoView()
}

export function transactionLeavesEditorInactive(
  transaction: Transaction
): boolean {
  return transaction.getMeta(inactiveBlockSelectionKey) === true
}

function blurInactiveEditor(view: EditorView) {
  view.dom.blur()
  view.dom.ownerDocument.getSelection()?.removeAllRanges()
}

export function inactiveBlockSelectionPlugin() {
  return new Plugin<boolean>({
    key: inactiveBlockSelectionKey,

    state: {
      init: () => false,
      apply(transaction, inactive) {
        const explicitState = transaction.getMeta(inactiveBlockSelectionKey)
        if (typeof explicitState === "boolean") return explicitState
        if (transaction.selectionSet) return false
        return inactive
      }
    },

    props: {
      attributes(state) {
        return inactiveBlockSelectionKey.getState(state)
          ? { class: INACTIVE_BLOCK_SELECTION_CLASS }
          : {}
      },

      handleDOMEvents: {
        mousedown(view) {
          if (!inactiveBlockSelectionKey.getState(view.state)) return false
          view.dispatch(
            view.state.tr
              .setMeta(inactiveBlockSelectionKey, false)
              .setMeta("addToHistory", false)
          )
          return false
        },

        focus(view) {
          if (!inactiveBlockSelectionKey.getState(view.state)) return false
          queueMicrotask(() => {
            if (inactiveBlockSelectionKey.getState(view.state)) {
              blurInactiveEditor(view)
            }
          })
          return false
        }
      }
    },

    view(view) {
      return {
        update(currentView, previousState) {
          const wasInactive =
            inactiveBlockSelectionKey.getState(previousState) ?? false
          const isInactive =
            inactiveBlockSelectionKey.getState(currentView.state) ?? false
          if (isInactive && !wasInactive) {
            blurInactiveEditor(currentView)
          }
        }
      }
    }
  })
}

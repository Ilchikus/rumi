// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, EditorState, Transaction } from "prosemirror-state"
import { Decoration, DecorationSet, EditorView } from "prosemirror-view"
import { Schema } from "prosemirror-model"

export interface MultiBlockSelectionState {
  selectedBlocks: number[]
  anchorBlock: number | null
}

export const multiBlockSelectionKey = new PluginKey<MultiBlockSelectionState>("multiBlockSelection")

export function clearMultiBlockSelection(view: EditorView) {
  const tr = view.state.tr.setMeta(multiBlockSelectionKey, {
    selectedBlocks: [],
    anchorBlock: null
  })
  view.dispatch(tr)
}

export function deleteSelectedBlocks(view: EditorView) {
  const pluginState = multiBlockSelectionKey.getState(view.state)
  if (!pluginState || !pluginState.selectedBlocks || pluginState.selectedBlocks.length === 0) return

  let tr = view.state.tr
  const { schema } = view.state

  // Sort positions in reverse order to delete from end to start
  const sorted = [...pluginState.selectedBlocks].sort((a, b) => b - a)

  for (const pos of sorted) {
    const mappedPos = tr.mapping.map(pos)
    const node = tr.doc.nodeAt(mappedPos)
    if (!node) continue
    tr = tr.delete(mappedPos, mappedPos + node.nodeSize)
  }

  // If doc is now empty, add an empty paragraph
  if (tr.doc.content.size === 0 || tr.doc.childCount === 0) {
    tr = tr.insert(0, schema.nodes.paragraph.create())
  }

  tr.setMeta(multiBlockSelectionKey, { selectedBlocks: [], anchorBlock: null })
  view.dispatch(tr)
  view.focus()
}

export function duplicateSelectedBlocks(view: EditorView) {
  const pluginState = multiBlockSelectionKey.getState(view.state)
  if (!pluginState || !pluginState.selectedBlocks || pluginState.selectedBlocks.length === 0) return

  let tr = view.state.tr

  // Sort positions in ascending order so we duplicate in document order
  const sorted = [...pluginState.selectedBlocks].sort((a, b) => a - b)

  // Find the last selected block to insert after it
  const lastPos = sorted[sorted.length - 1]
  const lastNode = view.state.doc.nodeAt(lastPos)
  if (!lastNode) return

  let insertPos = lastPos + lastNode.nodeSize
  const newPositions: number[] = []

  // Insert duplicates of all selected blocks after the last one
  for (const pos of sorted) {
    const node = view.state.doc.nodeAt(pos)
    if (!node) continue
    const mappedInsertPos = tr.mapping.map(insertPos)
    tr = tr.insert(mappedInsertPos, node.copy(node.content))
    newPositions.push(mappedInsertPos)
    insertPos = mappedInsertPos + node.nodeSize
  }

  // Select the duplicated blocks
  tr.setMeta(multiBlockSelectionKey, { selectedBlocks: newPositions, anchorBlock: newPositions[0] || null })
  view.dispatch(tr)
  view.focus()
}

export function selectBlock(view: EditorView, blockPos: number, mode: "single" | "shift" | "toggle") {
  const { state } = view
  const pluginState = multiBlockSelectionKey.getState(state)
  const currentSelected = pluginState?.selectedBlocks || []

  let newState: MultiBlockSelectionState

  if (mode === "shift" && pluginState?.anchorBlock !== null) {
    // Range selection from anchor to this block
    const anchor = pluginState!.anchorBlock!
    const from = Math.min(anchor, blockPos)
    const to = Math.max(anchor, blockPos)
    const blocks: number[] = []
    state.doc.forEach((node, offset) => {
      if (offset >= from && offset <= to) {
        blocks.push(offset)
      }
    })
    newState = { selectedBlocks: blocks, anchorBlock: anchor }
  } else if (mode === "toggle") {
    // Toggle this block in/out of selection
    const idx = currentSelected.indexOf(blockPos)
    const newBlocks = idx >= 0
      ? currentSelected.filter(p => p !== blockPos)
      : [...currentSelected, blockPos]
    newState = { selectedBlocks: newBlocks, anchorBlock: blockPos }
  } else {
    // Single selection
    newState = { selectedBlocks: [blockPos], anchorBlock: blockPos }
  }

  const tr = state.tr.setMeta(multiBlockSelectionKey, newState)
  tr.setMeta("multiBlockKeep", true)
  view.dispatch(tr)
}

export function multiBlockSelectionPlugin(_schema: Schema) {
  return new Plugin({
    key: multiBlockSelectionKey,

    state: {
      init(): MultiBlockSelectionState {
        return { selectedBlocks: [], anchorBlock: null }
      },
      apply(tr: Transaction, value: MultiBlockSelectionState): MultiBlockSelectionState {
        const meta = tr.getMeta(multiBlockSelectionKey)
        if (meta) return meta

        // If the user clicks in the editor (text selection changes), clear multi-block selection
        if (tr.selectionSet && !tr.getMeta("multiBlockKeep") && value.selectedBlocks.length > 0) {
          return { selectedBlocks: [], anchorBlock: null }
        }

        // Map positions through document changes
        if (tr.docChanged && value.selectedBlocks.length > 0) {
          const mapped = value.selectedBlocks
            .map(pos => tr.mapping.map(pos))
            .filter(pos => pos >= 0 && pos < tr.doc.content.size)
          // Verify each mapped position still points to a valid node
          const valid = mapped.filter(pos => tr.doc.nodeAt(pos) !== null)
          return {
            selectedBlocks: valid,
            anchorBlock: value.anchorBlock !== null ? tr.mapping.map(value.anchorBlock) : null
          }
        }

        return value
      }
    },

    props: {
      decorations(state: EditorState) {
        const pluginState = multiBlockSelectionKey.getState(state)
        if (!pluginState || !pluginState.selectedBlocks || pluginState.selectedBlocks.length === 0) return null

        const decorations: Decoration[] = []
        for (const pos of pluginState.selectedBlocks) {
          const node = state.doc.nodeAt(pos)
          if (!node) continue
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: "multi-block-selected"
            })
          )
        }
        return DecorationSet.create(state.doc, decorations)
      },

      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        const pluginState = multiBlockSelectionKey.getState(view.state)
        if (!pluginState || !pluginState.selectedBlocks || pluginState.selectedBlocks.length === 0) return false

        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault()
          deleteSelectedBlocks(view)
          return true
        }

        if (event.key === "Escape") {
          clearMultiBlockSelection(view)
          return true
        }

        return false
      }
    }
  })
}

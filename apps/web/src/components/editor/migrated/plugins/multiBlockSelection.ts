// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction
} from "prosemirror-state"
import { Decoration, DecorationSet, EditorView } from "prosemirror-view"
import { Fragment, Schema } from "prosemirror-model"

export interface MultiBlockSelectionState {
  selectedBlocks: number[]
  anchorBlock: number | null
}

export const multiBlockSelectionKey = new PluginKey<MultiBlockSelectionState>("multiBlockSelection")

export type BlockMoveDirection = "up" | "down"

interface TopLevelBlock {
  node: import("prosemirror-model").Node
  pos: number
}

function topLevelBlocks(state: EditorState): TopLevelBlock[] {
  const blocks: TopLevelBlock[] = []
  state.doc.forEach((node, pos) => blocks.push({ node, pos }))
  return blocks
}

function currentTopLevelBlockPos(state: EditorState): number | null {
  const { $from } = state.selection
  if ($from.depth > 0) return $from.before(1)
  return state.doc.nodeAt(state.selection.from) ? state.selection.from : null
}

function blockPositions(blocks: readonly TopLevelBlock[]): number[] {
  const positions: number[] = []
  let pos = 0
  for (const block of blocks) {
    positions.push(pos)
    pos += block.node.nodeSize
  }
  return positions
}

export function createMoveBlocksTransaction(
  state: EditorState,
  direction: BlockMoveDirection
): Transaction | null {
  const blocks = topLevelBlocks(state)
  const pluginState = multiBlockSelectionKey.getState(state)
  const selectedByPlugin = pluginState?.selectedBlocks ?? []
  const currentPos = currentTopLevelBlockPos(state)
  const requestedPositions = selectedByPlugin.length > 0
    ? [...new Set(selectedByPlugin)].sort((left, right) => left - right)
    : currentPos === null ? [] : [currentPos]
  const selectedIndices = requestedPositions
    .map((pos) => blocks.findIndex((block) => block.pos === pos))
    .filter((index) => index >= 0)

  if (selectedIndices.length === 0) return null

  const firstIndex = selectedIndices[0]
  const lastIndex = selectedIndices[selectedIndices.length - 1]
  const isContiguous = selectedIndices.every((index, offset) => index === firstIndex + offset)
  if (!isContiguous) return null
  if (direction === "up" && firstIndex === 0) return null
  if (direction === "down" && lastIndex === blocks.length - 1) return null

  const group = blocks.slice(firstIndex, lastIndex + 1)
  let reordered: TopLevelBlock[]
  let movedStartIndex: number

  if (direction === "up") {
    reordered = [
      ...blocks.slice(0, firstIndex - 1),
      ...group,
      blocks[firstIndex - 1],
      ...blocks.slice(lastIndex + 1)
    ]
    movedStartIndex = firstIndex - 1
  } else {
    reordered = [
      ...blocks.slice(0, firstIndex),
      blocks[lastIndex + 1],
      ...group,
      ...blocks.slice(lastIndex + 2)
    ]
    movedStartIndex = firstIndex + 1
  }

  const positions = blockPositions(reordered)
  const movedPositions = group.map((_, offset) => positions[movedStartIndex + offset])
  const transaction = state.tr.replaceWith(
    0,
    state.doc.content.size,
    reordered.map((block) => block.node)
  )

  if (selectedByPlugin.length > 0) {
    transaction.setMeta(multiBlockSelectionKey, {
      selectedBlocks: movedPositions,
      anchorBlock: movedPositions[0] ?? null
    })
    transaction.setMeta("multiBlockKeep", true)
    if (movedPositions[0] !== undefined) {
      transaction.setSelection(NodeSelection.create(transaction.doc, movedPositions[0]))
    }
  } else if (movedPositions[0] !== undefined && currentPos !== null) {
    if (state.selection instanceof TextSelection) {
      const movedNode = group[0].node
      const minTextPos = movedPositions[0] + 1
      const maxTextPos = movedPositions[0] + movedNode.nodeSize - 1
      const mappedAnchor = Math.max(
        minTextPos,
        Math.min(maxTextPos, movedPositions[0] + (state.selection.anchor - currentPos))
      )
      const mappedHead = Math.max(
        minTextPos,
        Math.min(maxTextPos, movedPositions[0] + (state.selection.head - currentPos))
      )
      transaction.setSelection(TextSelection.create(transaction.doc, mappedAnchor, mappedHead))
    } else {
      transaction.setSelection(NodeSelection.create(transaction.doc, movedPositions[0]))
    }
  }

  return transaction.scrollIntoView()
}

export function moveBlocks(direction: BlockMoveDirection): Command {
  return (state, dispatch) => {
    const transaction = createMoveBlocksTransaction(state, direction)
    if (!transaction) return false
    dispatch?.(transaction)
    return true
  }
}

export function createDuplicateBlocksTransaction(state: EditorState): Transaction | null {
  const blocks = topLevelBlocks(state)
  const pluginState = multiBlockSelectionKey.getState(state)
  const selectedByPlugin = pluginState?.selectedBlocks ?? []
  const currentPos = currentTopLevelBlockPos(state)
  const requestedPositions = selectedByPlugin.length > 0
    ? [...new Set(selectedByPlugin)].sort((left, right) => left - right)
    : currentPos === null ? [] : [currentPos]
  const selected = requestedPositions
    .map((pos) => blocks.find((block) => block.pos === pos))
    .filter((block): block is TopLevelBlock => Boolean(block))

  if (selected.length === 0) return null

  const last = selected[selected.length - 1]
  const insertPos = last.pos + last.node.nodeSize
  const copies = selected.map((block) => block.node.copy(block.node.content))
  const duplicatedPositions: number[] = []
  let nextPos = insertPos

  for (const copy of copies) {
    duplicatedPositions.push(nextPos)
    nextPos += copy.nodeSize
  }

  const transaction = state.tr
    .insert(insertPos, Fragment.fromArray(copies))
    .setMeta(multiBlockSelectionKey, {
      selectedBlocks: duplicatedPositions,
      anchorBlock: duplicatedPositions[0] ?? null
    })
    .setMeta("multiBlockKeep", true)

  transaction.setSelection(NodeSelection.create(transaction.doc, insertPos))
  return transaction.scrollIntoView()
}

export const duplicateBlocks: Command = (state, dispatch) => {
  const transaction = createDuplicateBlocksTransaction(state)
  if (!transaction) return false
  dispatch?.(transaction)
  return true
}

export const selectAllBlocksInStages: Command = (state, dispatch) => {
  const blocks = topLevelBlocks(state)
  if (blocks.length === 0) return false

  const current = multiBlockSelectionKey.getState(state)
  const currentPos = currentTopLevelBlockPos(state)
  const selectedBlocks = current?.selectedBlocks.length
    ? blocks.map((block) => block.pos)
    : currentPos === null ? [] : [currentPos]

  if (selectedBlocks.length === 0) return false

  if (dispatch) {
    const transaction = state.tr
      .setMeta(multiBlockSelectionKey, {
        selectedBlocks,
        anchorBlock: selectedBlocks[0] ?? null
      })
      .setMeta("multiBlockKeep", true)
      .setSelection(NodeSelection.create(state.doc, selectedBlocks[0]))
    dispatch(transaction.scrollIntoView())
  }

  return true
}

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
  const transaction = createDuplicateBlocksTransaction(view.state)
  if (!transaction) return
  view.dispatch(transaction)
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

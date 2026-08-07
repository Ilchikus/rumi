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
import {
  createCaretlessBlankBlockDeletionTransaction,
  transactionLeavesEditorInactive
} from "../inactiveBlockSelection"
import {
  StructuralCaretSelection,
  structuralCaretAtBlock,
  structuralCaretContext,
  setSelectionBeforeNextSpecialBlock
} from "../structuralCaretSelection"

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

interface TextRowSeparator {
  from: number
  to: number
}

function textRowSeparators(node: import("prosemirror-model").Node): TextRowSeparator[] {
  const separators: TextRowSeparator[] = []

  node.forEach((child, offset) => {
    if (child.type.name === "soft_break" || child.type.name === "hard_break") {
      separators.push({ from: offset, to: offset + child.nodeSize })
      return
    }

    if (!child.isText || !child.text) return

    for (let index = child.text.indexOf("\n"); index >= 0; index = child.text.indexOf("\n", index + 1)) {
      separators.push({ from: offset + index, to: offset + index + 1 })
    }
  })

  return separators
}

export function textRowSelectionAtPosition(
  state: EditorState,
  pos: number
): TextSelection | null {
  if (pos < 0 || pos > state.doc.content.size) return null

  const $pos = state.doc.resolve(pos)
  let textblockDepth = $pos.depth
  while (textblockDepth > 0 && !$pos.node(textblockDepth).isTextblock) {
    textblockDepth -= 1
  }
  if (textblockDepth === 0) return null

  const textblock = $pos.node(textblockDepth)
  const separators = textRowSeparators(textblock)
  if (separators.length === 0) return null

  const contentStart = $pos.start(textblockDepth)
  const clickOffset = Math.max(0, Math.min(textblock.content.size, pos - contentStart))
  let rowFrom = 0
  let rowTo = textblock.content.size

  for (const separator of separators) {
    if (clickOffset > separator.from) {
      rowFrom = separator.to
    } else {
      rowTo = separator.from
      break
    }
  }

  return TextSelection.create(state.doc, contentStart + rowFrom, contentStart + rowTo)
}

function topLevelBlocks(state: EditorState): TopLevelBlock[] {
  const blocks: TopLevelBlock[] = []
  state.doc.forEach((node, pos) => blocks.push({ node, pos }))
  return blocks
}

function currentTopLevelBlockPos(state: EditorState): number | null {
  if (state.selection instanceof StructuralCaretSelection) {
    return structuralCaretContext(
      state.selection.$head,
      state.selection.side
    )?.nodePos ?? null
  }
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
    } else if (state.selection instanceof StructuralCaretSelection) {
      transaction.setSelection(structuralCaretAtBlock(
        transaction.doc,
        movedPositions[0],
        state.selection.side
      ))
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

export const selectEveryBlock: Command = (state, dispatch) => {
  const selectedBlocks = topLevelBlocks(state).map((block) => block.pos)
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

export function extendBlockSelection(
  direction: "up" | "down",
  toDocumentBoundary = false
): Command {
  return (state, dispatch) => {
    const pluginState = multiBlockSelectionKey.getState(state)
    const selected = [...new Set(pluginState?.selectedBlocks ?? [])]
      .filter((pos) => state.doc.nodeAt(pos) !== null)
      .sort((left, right) => left - right)
    if (selected.length === 0) return false

    const positions: number[] = []
    state.doc.forEach((_node, pos) => positions.push(pos))
    const anchor = pluginState?.anchorBlock !== null &&
        pluginState?.anchorBlock !== undefined &&
        positions.includes(pluginState.anchorBlock)
      ? pluginState.anchorBlock
      : selected[0]!
    const active = state.selection instanceof NodeSelection &&
        selected.includes(state.selection.from)
      ? state.selection.from
      : anchor
    const anchorIndex = positions.indexOf(anchor)
    const activeIndex = positions.indexOf(active)
    if (anchorIndex < 0 || activeIndex < 0) return false

    const targetIndex = toDocumentBoundary
      ? direction === "down" ? positions.length - 1 : 0
      : activeIndex + (direction === "down" ? 1 : -1)
    if (targetIndex < 0 || targetIndex >= positions.length) return true

    if (dispatch) {
      const range = positions.slice(
        Math.min(toDocumentBoundary ? activeIndex : anchorIndex, targetIndex),
        Math.max(toDocumentBoundary ? activeIndex : anchorIndex, targetIndex) + 1
      )
      const selectedBlocks = toDocumentBoundary
        ? [...new Set([...selected, ...range])].sort((left, right) => left - right)
        : range
      const activePos = positions[targetIndex]!
      dispatch(
        state.tr
          .setSelection(NodeSelection.create(state.doc, activePos))
          .setMeta(multiBlockSelectionKey, {
            selectedBlocks,
            anchorBlock: anchor
          })
          .setMeta("multiBlockKeep", true)
          .scrollIntoView()
      )
    }
    return true
  }
}

export function createDeleteSelectedBlocksTransaction(
  state: EditorState
): Transaction | null {
  const pluginState = multiBlockSelectionKey.getState(state)
  return createDeleteBlocksTransaction(
    state,
    pluginState?.selectedBlocks ?? []
  )
}

export function createDeleteBlocksTransaction(
  state: EditorState,
  blockPositions: readonly number[]
): Transaction | null {
  const validPositions = [...new Set(blockPositions)]
    .filter((pos) => state.doc.nodeAt(pos) !== null)
    .sort((left, right) => left - right)
  if (validPositions.length === 0) return null

  if (validPositions.length === 1) {
    const caretlessTransaction =
      createCaretlessBlankBlockDeletionTransaction(state, validPositions[0])
    if (caretlessTransaction) {
      caretlessTransaction.setMeta(multiBlockSelectionKey, {
        selectedBlocks: [],
        anchorBlock: null
      })
      return caretlessTransaction
    }
  }

  let transaction = state.tr

  // Remove from the end to keep source positions stable. ProseMirror maps the
  // existing selection to the nearest surviving position and inserts the
  // schema's default paragraph only when deletion empties the whole document.
  for (const pos of [...validPositions].reverse()) {
    const mappedPos = transaction.mapping.map(pos)
    const node = transaction.doc.nodeAt(mappedPos)
    if (!node) continue

    transaction = transaction.delete(mappedPos, mappedPos + node.nodeSize)
  }

  if (!transaction.docChanged) return null
  setSelectionBeforeNextSpecialBlock(transaction, validPositions[0])
  transaction.setMeta(multiBlockSelectionKey, {
    selectedBlocks: [],
    anchorBlock: null
  })
  return transaction.scrollIntoView()
}

export function deleteSelectedBlocks(view: EditorView) {
  const transaction = createDeleteSelectedBlocksTransaction(view.state)
  if (!transaction) return

  const deactivateSelection = transactionLeavesEditorInactive(transaction)
  view.dispatch(transaction)
  if (!deactivateSelection) view.focus()
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
    const currentAnchor = pluginState?.anchorBlock ?? null
    const anchorBlock = idx < 0
      ? blockPos
      : currentAnchor !== null && newBlocks.includes(currentAnchor)
        ? currentAnchor
        : newBlocks.at(-1) ?? null
    newState = { selectedBlocks: newBlocks, anchorBlock }
  } else {
    // Single selection
    newState = { selectedBlocks: [blockPos], anchorBlock: blockPos }
  }

  const tr = state.tr.setMeta(multiBlockSelectionKey, newState)
  tr.setMeta("multiBlockKeep", true)
  const activeBlock = mode === "toggle" && !newState.selectedBlocks.includes(blockPos)
    ? newState.anchorBlock
    : blockPos
  if (activeBlock !== null && state.doc.nodeAt(activeBlock)) {
    tr.setSelection(NodeSelection.create(state.doc, activeBlock))
  } else if (state.selection instanceof NodeSelection) {
    tr.setSelection(TextSelection.near(state.doc.resolve(blockPos + 1)))
  }
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

      handleTripleClick(view: EditorView, pos: number, event: MouseEvent) {
        if (event.button !== 0) return false

        const selection = textRowSelectionAtPosition(view.state, pos)
        if (!selection) return false

        if (!view.focused) view.focus()
        if (!view.state.selection.eq(selection)) {
          view.dispatch(
            view.state.tr
              .setSelection(selection)
              .setMeta("pointer", true)
          )
        }
        return true
      },

      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        const pluginState = multiBlockSelectionKey.getState(view.state)
        if (!pluginState || !pluginState.selectedBlocks || pluginState.selectedBlocks.length === 0) return false

        if (
          event.shiftKey &&
          !event.altKey &&
          !event.ctrlKey &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
          event.preventDefault()
          return extendBlockSelection(
            event.key === "ArrowDown" ? "down" : "up",
            event.metaKey
          )(view.state, view.dispatch)
        }

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

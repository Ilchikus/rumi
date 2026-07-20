// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { keymap } from "prosemirror-keymap"
import { Schema } from "prosemirror-model"
import { Command, NodeSelection, TextSelection } from "prosemirror-state"
import {
  toggleMark,
  setBlockType,
  chainCommands,
  exitCode,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  splitBlock,
  wrapIn
} from "prosemirror-commands"
import { undo, redo } from "prosemirror-history"
import { goToNextCell } from "prosemirror-tables"
import { duplicateBlocks, moveBlocks, selectAllBlocksInStages } from "./plugins/multiBlockSelection"

const mac = typeof navigator !== "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : false

// When cursor is on a horizontal_rule (NodeSelection), insert a paragraph after it (Enter)
function exitHorizontalRuleEnter(schema: Schema): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection)) return false
    const node = state.doc.nodeAt(selection.from)
    if (!node || node.type !== schema.nodes.horizontal_rule) return false
    if (dispatch) {
      const pos = selection.to
      const paragraph = schema.nodes.paragraph.create()
      const tr = state.tr.insert(pos, paragraph)
      tr.setSelection(TextSelection.create(tr.doc, pos + 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

// When cursor is on a horizontal_rule (NodeSelection), ArrowDown navigates to next block
// or does nothing if there's no next block (don't insert paragraph)
function arrowDownFromHorizontalRule(schema: Schema): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof NodeSelection)) return false
    const node = state.doc.nodeAt(selection.from)
    if (!node || node.type !== schema.nodes.horizontal_rule) return false
    // Check if there's a block after the HR
    const afterPos = selection.to
    if (afterPos >= state.doc.content.size) return true // no next block, consume but do nothing
    if (dispatch) {
      const nextNode = state.doc.nodeAt(afterPos)
      let tr: ReturnType<typeof state.tr>
      if (nextNode && nextNode.type === schema.nodes.horizontal_rule) {
        // Next block is also an HR — select it as NodeSelection
        tr = state.tr.setSelection(NodeSelection.create(state.doc, afterPos))
      } else {
        // Move cursor to start of next block's text content
        tr = state.tr.setSelection(TextSelection.create(state.doc, afterPos + 1))
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

export function removeEmptyParagraphBlock(schema: Schema): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof TextSelection) || !selection.empty) return false
    const { $from } = selection
    if (
      $from.depth !== 1 ||
      $from.parent.type !== schema.nodes.paragraph ||
      $from.parent.content.size !== 0 ||
      state.doc.childCount <= 1
    ) return false

    if (dispatch) {
      const blockStart = $from.before(1)
      const transaction = state.tr.delete(blockStart, blockStart + $from.parent.nodeSize)
      const nextPosition = Math.min(blockStart, transaction.doc.content.size)
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(nextPosition), 1))
      dispatch(transaction.scrollIntoView())
    }
    return true
  }
}

function buildKeymap(schema: Schema) {
  const keys: { [key: string]: Command } = {}

  // History
  keys["Mod-z"] = undo
  keys["Shift-Mod-z"] = redo
  if (!mac) keys["Mod-y"] = redo

  // Marks
  if (schema.marks.bold) {
    keys["Mod-b"] = toggleMark(schema.marks.bold)
    keys["Mod-B"] = toggleMark(schema.marks.bold)
  }
  if (schema.marks.italic) {
    keys["Mod-i"] = toggleMark(schema.marks.italic)
    keys["Mod-I"] = toggleMark(schema.marks.italic)
  }
  if (schema.marks.underline) {
    keys["Mod-u"] = toggleMark(schema.marks.underline)
    keys["Mod-U"] = toggleMark(schema.marks.underline)
  }
  if (schema.marks.strikethrough) {
    keys["Mod-Shift-s"] = toggleMark(schema.marks.strikethrough)
    keys["Mod-Shift-S"] = toggleMark(schema.marks.strikethrough)
  }
  if (schema.marks.code) {
    keys["Mod-e"] = toggleMark(schema.marks.code)
    keys["Mod-E"] = toggleMark(schema.marks.code)
  }
  if (schema.marks.highlight) {
    keys["Mod-Shift-h"] = toggleMark(schema.marks.highlight)
    keys["Mod-Shift-H"] = toggleMark(schema.marks.highlight)
  }

  // Block types
  if (schema.nodes.heading) {
    keys["Mod-Alt-1"] = setBlockType(schema.nodes.heading, { level: 1 })
    keys["Mod-Alt-2"] = setBlockType(schema.nodes.heading, { level: 2 })
    keys["Mod-Alt-3"] = setBlockType(schema.nodes.heading, { level: 3 })
  }
  if (schema.nodes.paragraph) {
    keys["Mod-Alt-0"] = setBlockType(schema.nodes.paragraph)
  }

  // Block-level editing. Movement intentionally uses Control on every
  // platform rather than Mod so macOS matches Windows and Linux here.
  keys["Ctrl-Shift-ArrowUp"] = moveBlocks("up")
  keys["Ctrl-Shift-ArrowDown"] = moveBlocks("down")
  keys["Mod-d"] = duplicateBlocks
  keys["Mod-D"] = duplicateBlocks
  keys["Mod-a"] = selectAllBlocksInStages
  keys["Backspace"] = removeEmptyParagraphBlock(schema)
  keys["Delete"] = removeEmptyParagraphBlock(schema)

  // Flat list item types
  const flatListItemTypes = [
    schema.nodes.bullet_item,
    schema.nodes.numbered_item,
    schema.nodes.task_item
  ].filter(Boolean)

  // Check if current selection is in a flat list item
  const isInFlatListItem = (schema: Schema): Command => (state) => {
    const { $from } = state.selection
    const parent = $from.parent
    return flatListItemTypes.some(type => parent.type === type)
  }

  // Split flat list item: create a new item of the same type after cursor
  const splitFlatListItem: Command = (state, dispatch) => {
    const { $from, $to } = state.selection
    const parent = $from.parent

    // Check if we're in a flat list item
    const itemType = flatListItemTypes.find(type => parent.type === type)
    if (!itemType) return false

    // If selection is not collapsed, delete selection first
    if (!state.selection.empty) {
      if (dispatch) {
        const tr = state.tr.deleteSelection()
        dispatch(tr)
      }
      return true
    }

    const indent = parent.attrs.indent || 0
    const attrs: Record<string, unknown> = { indent }

    // For task items, new items start unchecked
    if (itemType === schema.nodes.task_item) {
      attrs.checked = false
    }

    if (dispatch) {
      const tr = state.tr

      // Get text after cursor
      const textAfter = parent.textBetween($from.parentOffset, parent.content.size, null, "\ufffc")

      // Get position of current block
      const blockStart = $from.before()
      const blockEnd = $from.after()

      // If cursor is at the end, create empty new item
      if ($from.parentOffset === parent.content.size) {
        // Insert new item after current
        const newItem = itemType.create(attrs)
        tr.insert(blockEnd, newItem)
        tr.setSelection(TextSelection.create(tr.doc, blockEnd + 1))
      } else {
        // Split: keep text before cursor in current, put text after in new item
        const contentBefore = parent.cut(0, $from.parentOffset)
        const contentAfter = parent.cut($from.parentOffset)

        // Replace current block with truncated version
        const currentAttrs = { ...parent.attrs }
        const currentItem = itemType.create(currentAttrs, contentBefore.content)
        const newItem = itemType.create(attrs, contentAfter.content)

        tr.replaceWith(blockStart, blockEnd, [currentItem, newItem])
        tr.setSelection(TextSelection.create(tr.doc, blockStart + currentItem.nodeSize + 1))
      }

      dispatch(tr.scrollIntoView())
    }
    return true
  }

  // Convert empty flat list item to paragraph
  const liftEmptyFlatListItem: Command = (state, dispatch) => {
    const { $from } = state.selection
    const parent = $from.parent

    // Check if we're in a flat list item
    const itemType = flatListItemTypes.find(type => parent.type === type)
    if (!itemType) return false

    // Only lift if item is empty
    if (parent.content.size > 0) return false

    if (dispatch) {
      const blockStart = $from.before()
      const blockEnd = $from.after()
      const paragraph = schema.nodes.paragraph.create()
      const tr = state.tr.replaceWith(blockStart, blockEnd, paragraph)
      tr.setSelection(TextSelection.create(tr.doc, blockStart + 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  // Indent flat list item (Tab)
  const indentFlatListItem: Command = (state, dispatch) => {
    const { $from } = state.selection
    const parent = $from.parent

    // Check if we're in a flat list item
    const itemType = flatListItemTypes.find(type => parent.type === type)
    if (!itemType) return false

    const currentIndent = parent.attrs.indent || 0
    if (currentIndent >= 4) return false // Max indent level

    if (dispatch) {
      const blockStart = $from.before()
      const tr = state.tr.setNodeMarkup(blockStart, undefined, {
        ...parent.attrs,
        indent: currentIndent + 1
      })
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  // Outdent flat list item (Shift-Tab)
  const outdentFlatListItem: Command = (state, dispatch) => {
    const { $from } = state.selection
    const parent = $from.parent

    // Check if we're in a flat list item
    const itemType = flatListItemTypes.find(type => parent.type === type)
    if (!itemType) return false

    const currentIndent = parent.attrs.indent || 0
    if (currentIndent <= 0) return false // Can't outdent further

    if (dispatch) {
      const blockStart = $from.before()
      const tr = state.tr.setNodeMarkup(blockStart, undefined, {
        ...parent.attrs,
        indent: currentIndent - 1
      })
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  // Enter key: ordered by priority
  keys["Enter"] = chainCommands(
    exitHorizontalRuleEnter(schema),
    newlineInCode,
    liftEmptyFlatListItem,
    splitFlatListItem,
    liftEmptyBlock,
    createParagraphNear,
    splitBlock
  )

  // ArrowDown on HR: navigate to next block (don't insert paragraph)
  if (schema.nodes.horizontal_rule) {
    keys["ArrowDown"] = arrowDownFromHorizontalRule(schema)
  }

  // Insert tab in code block
  const insertTabInCode: Command = (state, dispatch) => {
    const { $from } = state.selection
    if ($from.parent.type !== schema.nodes.code_block) return false

    if (dispatch) {
      dispatch(state.tr.insertText("\t").scrollIntoView())
    }
    return true
  }

  // Tab/Shift-Tab for code blocks, flat list items, and table navigation
  keys["Tab"] = chainCommands(insertTabInCode, goToNextCell(1), indentFlatListItem)
  keys["Shift-Tab"] = chainCommands(goToNextCell(-1), outdentFlatListItem)

  // Blockquote
  if (schema.nodes.blockquote) {
    keys["Mod-Shift-."] = wrapIn(schema.nodes.blockquote)
  }

  // Hard break
  if (schema.nodes.hard_break) {
    const br = schema.nodes.hard_break
    const cmd: Command = (state, dispatch) => {
      if (dispatch) {
        dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
      }
      return true
    }
    keys["Shift-Enter"] = cmd
  }

  // Code block - exit with Mod-Enter
  if (schema.nodes.code_block) {
    keys["Mod-Enter"] = exitCode
  }

  return keymap(keys)
}

export { buildKeymap }

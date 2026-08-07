// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { keymap } from "prosemirror-keymap"
import { undoInputRule } from "prosemirror-inputrules"
import { Schema } from "prosemirror-model"
import { Command, NodeSelection, Plugin, PluginKey, TextSelection } from "prosemirror-state"
import {
  setBlockType,
  chainCommands,
  exitCode,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  splitBlock,
  wrapIn
} from "prosemirror-commands"
import { goToNextCell } from "prosemirror-tables"
import {
  redoEditorChange,
  undoEditorChange
} from "./editorHistory"
import {
  duplicateBlocks,
  moveBlocks,
  multiBlockSelectionKey,
  selectAllBlocksInStages
} from "./plugins/multiBlockSelection"
import { toggleInlineMark } from "./plugins/inlineFormatting"
import {
  BLOCK_CONTEXT_MENU_INTENT_META,
  type BlockContextMenuIntent
} from "./plugins/blockContextMenuModel"
import { createCaretlessBlankBlockDeletionTransaction } from "./inactiveBlockSelection"
import { insertAdjacentParagraphCommand } from "./plugins/topToolbarActions"
import { openSelectionToolbarLinkEditor } from "./plugins/selectionToolbar"

const mac = typeof navigator !== "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : false
const INLINE_CODE_BOUNDARY_ENTER_META = "rumiInlineCodeBoundaryEnter"
const INLINE_CODE_BOUNDARY_EXIT_META = "rumiInlineCodeBoundaryExit"
const INLINE_CODE_BOUNDARY_CONTINUE_META = "rumiInlineCodeBoundaryContinue"

interface InlineCodeBoundaryState {
  position: number
}

export const inlineCodeBoundaryPluginKey =
  new PluginKey<InlineCodeBoundaryState | null>("inlineCodeBoundary")

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

    const blockStart = $from.before(1)
    const previousNode = state.doc.resolve(blockStart).nodeBefore

    const caretlessTransaction =
      createCaretlessBlankBlockDeletionTransaction(state, blockStart)
    if (caretlessTransaction) {
      if (dispatch) {
        dispatch(caretlessTransaction)
      }
      return true
    }

    if (dispatch) {
      const transaction = state.tr.delete(blockStart, blockStart + $from.parent.nodeSize)
      const boundary = Math.min(blockStart, transaction.doc.content.size)
      transaction.setSelection(TextSelection.near(
        transaction.doc.resolve(boundary),
        previousNode ? -1 : 1
      ))
      dispatch(transaction.scrollIntoView())
    }
    return true
  }
}

export function resetEmptyFormattedBlock(schema: Schema): Command {
  const resettableTypes = new Set([
    schema.nodes.heading,
    schema.nodes.code_block,
    schema.nodes.mermaid,
    schema.nodes.bullet_item,
    schema.nodes.numbered_item,
    schema.nodes.task_item,
    schema.nodes.blockquote
  ].filter(Boolean))

  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof TextSelection) || !selection.empty) return false

    const { $from } = selection
    if ($from.depth < 1) return false

    const block = $from.node(1)
    if (!resettableTypes.has(block.type)) return false

    const isEmptyTextBlock = block.isTextblock && block.content.size === 0
    const isEmptyBlockquote =
      block.type === schema.nodes.blockquote &&
      block.childCount === 1 &&
      block.firstChild?.type === schema.nodes.paragraph &&
      block.firstChild.content.size === 0
    if (!isEmptyTextBlock && !isEmptyBlockquote) return false

    if (dispatch) {
      const blockStart = $from.before(1)
      const transaction = state.tr.replaceWith(
        blockStart,
        blockStart + block.nodeSize,
        schema.nodes.paragraph.create()
      )
      transaction.setSelection(TextSelection.create(
        transaction.doc,
        blockStart + 1
      ))
      dispatch(transaction.scrollIntoView())
    }
    return true
  }
}

function getFlatListItemTypes(schema: Schema) {
  return [
    schema.nodes.bullet_item,
    schema.nodes.numbered_item,
    schema.nodes.task_item
  ].filter(Boolean)
}

export function enterInlineCodeAtEnd(schema: Schema): Command {
  return (state, dispatch) => {
    const { selection } = state
    const code = schema.marks.code
    if (
      !code ||
      !(selection instanceof TextSelection) ||
      !selection.empty ||
      selection.$from.parent.type.spec.code ||
      code.isInSet(state.storedMarks ?? []) ||
      !code.isInSet(selection.$from.nodeBefore?.marks ?? []) ||
      code.isInSet(selection.$from.nodeAfter?.marks ?? [])
    ) return false

    dispatch?.(
      state.tr
        .addStoredMark(code.create())
        .setMeta(INLINE_CODE_BOUNDARY_ENTER_META, true)
    )
    return true
  }
}

export function exitInlineCodeAtEnd(schema: Schema): Command {
  return (state, dispatch) => {
    const { selection } = state
    const code = schema.marks.code
    if (
      !code ||
      !(selection instanceof TextSelection) ||
      !selection.empty ||
      !code.isInSet(state.storedMarks ?? []) ||
      !code.isInSet(selection.$from.nodeBefore?.marks ?? []) ||
      code.isInSet(selection.$from.nodeAfter?.marks ?? [])
    ) return false

    dispatch?.(
      state.tr
        .removeStoredMark(code)
        .setMeta(INLINE_CODE_BOUNDARY_EXIT_META, true)
    )
    return true
  }
}

export function inlineCodeBoundaryPlugin(schema: Schema): Plugin {
  return new Plugin<InlineCodeBoundaryState | null>({
    key: inlineCodeBoundaryPluginKey,
    state: {
      init: () => null,
      apply(transaction, boundary, _oldState, newState) {
        if (transaction.getMeta(INLINE_CODE_BOUNDARY_EXIT_META)) return null
        if (transaction.getMeta(INLINE_CODE_BOUNDARY_ENTER_META)) {
          return { position: newState.selection.from }
        }
        if (!boundary) return null

        const position = transaction.mapping.map(boundary.position, 1)
        const { selection } = newState
        if (
          !(selection instanceof TextSelection) ||
          !selection.empty ||
          selection.from !== position
        ) return null

        return { position }
      }
    },
    props: {
      handleKeyDown(view, event) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false

        const boundary = inlineCodeBoundaryPluginKey.getState(view.state)
        if (
          event.key === "ArrowLeft" &&
          boundary?.position === view.state.selection.from
        ) {
          // The first ArrowLeft chooses the code-side affinity without changing
          // the document position. Let the second one move through the code.
          return false
        }

        if (
          event.key === "ArrowRight" &&
          boundary?.position === view.state.selection.from
        ) {
          const code = schema.marks.code
          if (!code) return false
          view.dispatch(
            view.state.tr
              .removeStoredMark(code)
              .setMeta(INLINE_CODE_BOUNDARY_EXIT_META, true)
          )

          if (typeof view.domAtPos === "function") {
            const domPosition = view.domAtPos(boundary.position, 1)
            const ownerDocument = domPosition.node.ownerDocument ?? view.dom.ownerDocument
            ownerDocument.getSelection()?.collapse(domPosition.node, domPosition.offset)
          }
          return true
        }

        const command = event.key === "ArrowLeft"
          ? enterInlineCodeAtEnd(schema)
          : event.key === "ArrowRight"
            ? exitInlineCodeAtEnd(schema)
            : null
        if (!command) return false

        const position = view.state.selection.from
        const handled = command(view.state, view.dispatch.bind(view))
        if (!handled || typeof view.domAtPos !== "function") return handled

        const side = event.key === "ArrowLeft" ? -1 : 1
        const domPosition = view.domAtPos(position, side)
        const ownerDocument = domPosition.node.ownerDocument ?? view.dom.ownerDocument
        ownerDocument.getSelection()?.collapse(domPosition.node, domPosition.offset)
        return true
      },
      handleTextInput(view, from, to, text) {
        const boundary = inlineCodeBoundaryPluginKey.getState(view.state)
        const code = schema.marks.code
        if (
          !boundary ||
          !code ||
          from !== boundary.position ||
          to !== boundary.position ||
          /[\r\n]/u.test(text)
        ) return false

        view.dispatch(
          view.state.tr
            .insertText(text, from, to)
            .addMark(from, from + text.length, code.create())
            .addStoredMark(code.create())
            .setMeta(INLINE_CODE_BOUNDARY_CONTINUE_META, true)
        )
        return true
      },
      handleDOMEvents: {
        mousedown(view) {
          const boundary = inlineCodeBoundaryPluginKey.getState(view.state)
          const code = schema.marks.code
          if (!boundary || !code) return false
          view.dispatch(
            view.state.tr
              .removeStoredMark(code)
              .setMeta(INLINE_CODE_BOUNDARY_EXIT_META, true)
          )
          return false
        },
        blur(view) {
          const code = schema.marks.code
          if (!code || !inlineCodeBoundaryPluginKey.getState(view.state)) return false
          view.dispatch(
            view.state.tr
              .removeStoredMark(code)
              .setMeta(INLINE_CODE_BOUNDARY_EXIT_META, true)
          )
          return false
        }
      }
    },
    appendTransaction(transactions, _oldState, newState) {
      const code = schema.marks.code
      const { selection } = newState
      if (
        !code ||
        transactions.some((transaction) =>
          transaction.getMeta(INLINE_CODE_BOUNDARY_EXIT_META)
        ) ||
        !inlineCodeBoundaryPluginKey.getState(newState) ||
        code.isInSet(newState.storedMarks ?? []) ||
        !(selection instanceof TextSelection) ||
        !selection.empty ||
        !code.isInSet(selection.$from.nodeBefore?.marks ?? []) ||
        code.isInSet(selection.$from.nodeAfter?.marks ?? [])
      ) return null

      return newState.tr.addStoredMark(code.create())
    }
  })
}

export function splitFlatListItem(schema: Schema): Command {
  const itemTypes = getFlatListItemTypes(schema)

  return (state, dispatch) => {
    const { $from } = state.selection
    const parent = $from.parent
    const itemType = itemTypes.find((type) => parent.type === type)
    if (!itemType) return false

    if (!state.selection.empty) {
      if (dispatch) dispatch(state.tr.deleteSelection())
      return true
    }

    const attrs: Record<string, unknown> = { indent: parent.attrs.indent || 0 }
    if (itemType === schema.nodes.task_item) attrs.checked = false

    if (dispatch) {
      const blockStart = $from.before()
      const blockEnd = $from.after()
      const transaction = state.tr

      if ($from.parentOffset === parent.content.size) {
        transaction.insert(blockEnd, itemType.create(attrs))
        transaction.setSelection(TextSelection.create(transaction.doc, blockEnd + 1))
      } else {
        const currentItem = itemType.create({ ...parent.attrs }, parent.cut(0, $from.parentOffset).content)
        const newItem = itemType.create(attrs, parent.cut($from.parentOffset).content)

        transaction.replaceWith(blockStart, blockEnd, [currentItem, newItem])
        transaction.setSelection(TextSelection.create(
          transaction.doc,
          blockStart + currentItem.nodeSize + 1
        ))
      }

      dispatch(transaction.scrollIntoView())
    }
    return true
  }
}

export function insertLiteralNewlineInCode(schema: Schema): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (
      !(selection instanceof TextSelection) ||
      !selection.$from.parent.type.spec.code ||
      !selection.$to.parent.type.spec.code ||
      selection.$from.parent !== selection.$to.parent
    ) {
      return false
    }

    if (dispatch) {
      dispatch(
        state.tr
          .insertText("\n", selection.from, selection.to)
          .scrollIntoView()
      )
    }
    return true
  }
}

export function moveToCodeBoundary(
  direction: "start" | "end"
): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof TextSelection) || !selection.empty) return false

    const { $from } = selection
    if (!$from.parent.type.spec.code) return false

    const boundary = direction === "start" ? $from.start() : $from.end()
    if (selection.from === boundary) {
      // At the block boundary, preserve the platform's native command-arrow
      // behavior so the next press reaches the document boundary.
      return false
    }

    dispatch?.(
      state.tr
        .setSelection(TextSelection.create(state.doc, boundary))
        .scrollIntoView()
    )
    return true
  }
}

function stagedBlockSelection(
  contextMenuIntent: BlockContextMenuIntent
): Command {
  return (state, dispatch) => selectAllBlocksInStages(
    state,
    dispatch
      ? (transaction) => {
          transaction.setMeta(
            BLOCK_CONTEXT_MENU_INTENT_META,
            contextMenuIntent
          )
          dispatch(transaction)
        }
      : undefined
  )
}

const toggleBlockContextMenu: Command = (state, dispatch) => {
  const selectedBlocks =
    multiBlockSelectionKey.getState(state)?.selectedBlocks ?? []
  if (selectedBlocks.length === 0) {
    return stagedBlockSelection("toggle")(state, dispatch)
  }

  dispatch?.(
    state.tr.setMeta(BLOCK_CONTEXT_MENU_INTENT_META, "toggle")
  )
  return true
}

function buildKeymap(schema: Schema) {
  const keys: { [key: string]: Command } = {}

  // History
  keys["Mod-z"] = chainCommands(undoInputRule, undoEditorChange)
  keys["Shift-Mod-z"] = redoEditorChange
  if (!mac) keys["Mod-y"] = redoEditorChange

  // Marks
  if (schema.marks.bold) {
    keys["Mod-b"] = toggleInlineMark(schema.marks.bold)
    keys["Mod-B"] = toggleInlineMark(schema.marks.bold)
  }
  if (schema.marks.italic) {
    keys["Mod-i"] = toggleInlineMark(schema.marks.italic)
    keys["Mod-I"] = toggleInlineMark(schema.marks.italic)
  }
  if (schema.marks.underline) {
    keys["Mod-u"] = toggleInlineMark(schema.marks.underline)
    keys["Mod-U"] = toggleInlineMark(schema.marks.underline)
  }
  if (schema.marks.strikethrough) {
    keys["Mod-Shift-s"] = toggleInlineMark(schema.marks.strikethrough)
    keys["Mod-Shift-S"] = toggleInlineMark(schema.marks.strikethrough)
  }
  if (schema.marks.code) {
    keys["Mod-e"] = toggleInlineMark(schema.marks.code)
    keys["Mod-E"] = toggleInlineMark(schema.marks.code)
  }
  if (schema.marks.highlight) {
    keys["Mod-Shift-h"] = toggleInlineMark(schema.marks.highlight)
    keys["Mod-Shift-H"] = toggleInlineMark(schema.marks.highlight)
  }
  if (schema.marks.link) {
    keys["Mod-Shift-k"] = openSelectionToolbarLinkEditor
    keys["Mod-Shift-K"] = openSelectionToolbarLinkEditor
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
  keys["Mod-a"] = stagedBlockSelection("close")
  keys["Mod-/"] = toggleBlockContextMenu
  const deleteEmptyBlock = chainCommands(
    resetEmptyFormattedBlock(schema),
    removeEmptyParagraphBlock(schema)
  )
  keys["Backspace"] = deleteEmptyBlock
  keys["Delete"] = deleteEmptyBlock
  keys["Mod-Backspace"] = deleteEmptyBlock
  keys["Mod-Delete"] = deleteEmptyBlock
  keys["Mod-ArrowUp"] = moveToCodeBoundary("start")
  keys["Mod-ArrowDown"] = moveToCodeBoundary("end")

  // Flat list item types
  const flatListItemTypes = getFlatListItemTypes(schema)

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
    splitFlatListItem(schema),
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
    if (!$from.parent.type.spec.code) return false

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
    const insertHardBreak: Command = (state, dispatch) => {
      if (dispatch) {
        dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
      }
      return true
    }
    keys["Shift-Enter"] = chainCommands(
      insertLiteralNewlineInCode(schema),
      insertHardBreak
    )
  }

  // Structural insertion. In code, Mod-Enter retains its established exit
  // behavior, which is the same semantic result as adding a block afterward.
  const addAfter = insertAdjacentParagraphCommand("after")
  keys["Shift-Mod-Enter"] = insertAdjacentParagraphCommand("before")
  keys["Mod-Enter"] = schema.nodes.code_block
    ? chainCommands(exitCode, addAfter)
    : addAfter

  return keymap(keys)
}

export { buildKeymap }

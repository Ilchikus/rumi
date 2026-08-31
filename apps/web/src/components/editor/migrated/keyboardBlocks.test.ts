import {
  EditorState,
  NodeSelection,
  TextSelection,
  type Transaction
} from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { history } from "prosemirror-history"
import { describe, expect, it } from "vitest"
import {
  buildKeymap,
  insertLiteralNewlineInCode,
  removeEmptyParagraphBlock,
  resetEmptyFormattedBlock,
  splitFlatListItem
} from "./keymap"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import {
  createDuplicateBlocksTransaction,
  createMoveBlocksTransaction,
  duplicateBlocks,
  extendBlockSelection,
  multiBlockSelectionKey,
  multiBlockSelectionPlugin,
  selectBlock,
  selectAllBlocksInStages,
  selectEveryBlock
} from "./plugins/multiBlockSelection"
import {
  inactiveBlockSelectionKey,
  inactiveBlockSelectionPlugin,
  transactionLeavesEditorInactive
} from "./inactiveBlockSelection"
import { StructuralCaretSelection } from "./structuralCaretSelection"
import {
  BLOCK_CONTEXT_MENU_INTENT_META
} from "./plugins/blockContextMenuModel"
import {
  selectionToolbarPlugin,
  selectionToolbarPluginKey
} from "./plugins/selectionToolbar"
import { schema } from "./schema"

function blockPositions(state: EditorState): number[] {
  const positions: number[] = []
  state.doc.forEach((_node, pos) => positions.push(pos))
  return positions
}

function editorState(markdown: string): EditorState {
  return EditorState.create({
    doc: parseMarkdown(markdown, schema),
    plugins: [multiBlockSelectionPlugin(schema), buildKeymap(schema)]
  })
}

function placeCursor(state: EditorState, blockIndex: number): EditorState {
  const pos = blockPositions(state)[blockIndex]!
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos + 1)))
}

describe("live editor keyboard block movement", () => {
  it("moves the cursor's block up and keeps the cursor in that block", () => {
    const state = placeCursor(editorState("One\n\nTwo\n\nThree\n"), 1)
    const transaction = createMoveBlocksTransaction(state, "up")

    expect(transaction).not.toBeNull()
    expect(serializeMarkdown(transaction!.doc)).toBe("Two\n\nOne\n\nThree\n")
    expect(transaction!.selection.$from.parent.textContent).toBe("Two")
  })

  it("moves a contiguous block selection down without changing its order", () => {
    let state = editorState("One\n\nTwo\n\nThree\n\nFour\n")
    const positions = blockPositions(state)
    state = state.apply(
      state.tr
        .setMeta(multiBlockSelectionKey, {
          selectedBlocks: [positions[1]!, positions[2]!],
          anchorBlock: positions[1]!
        })
        .setSelection(NodeSelection.create(state.doc, positions[1]!))
    )

    const transaction = createMoveBlocksTransaction(state, "down")
    expect(transaction).not.toBeNull()
    expect(serializeMarkdown(transaction!.doc)).toBe("One\n\nFour\n\nTwo\n\nThree\n")

    const nextState = state.apply(transaction!)
    const selected = multiBlockSelectionKey.getState(nextState)?.selectedBlocks ?? []
    expect(selected.map((pos) => nextState.doc.nodeAt(pos)?.textContent)).toEqual(["Two", "Three"])
  })

  it("does not move a selection beyond the document boundary", () => {
    const first = placeCursor(editorState("One\n\nTwo\n"), 0)
    const last = placeCursor(editorState("One\n\nTwo\n"), 1)

    expect(createMoveBlocksTransaction(first, "up")).toBeNull()
    expect(createMoveBlocksTransaction(last, "down")).toBeNull()
  })
})

describe("live editor keyboard block selection", () => {
  function selectedText(state: EditorState): string[] {
    return (multiBlockSelectionKey.getState(state)?.selectedBlocks ?? [])
      .map((pos) => state.doc.nodeAt(pos)?.textContent ?? "")
  }

  it("grows and shrinks an anchored block selection when Shift-Arrow reverses direction", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n\nFour\n", schema)
    const positions = blockPositions(EditorState.create({ doc }))
    let state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    state = state.apply(
      state.tr
        .setMeta(multiBlockSelectionKey, {
          selectedBlocks: [positions[1]],
          anchorBlock: positions[1]
        })
        .setSelection(NodeSelection.create(state.doc, positions[1]!))
    )

    expect(extendBlockSelection("down")(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(selectedText(state)).toEqual(["Two", "Three"])
    expect(state.selection).toBeInstanceOf(NodeSelection)
    expect(state.doc.nodeAt(state.selection.from)?.textContent).toBe("Three")

    expect(extendBlockSelection("up")(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(selectedText(state)).toEqual(["Two"])
    expect(state.doc.nodeAt(state.selection.from)?.textContent).toBe("Two")

    expect(extendBlockSelection("up")(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(selectedText(state)).toEqual(["One", "Two"])
    expect(state.doc.nodeAt(state.selection.from)?.textContent).toBe("One")

    expect(extendBlockSelection("down")(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(selectedText(state)).toEqual(["Two"])
  })

  it("preserves earlier groups while Shift extends the latest Cmd-selected block", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n\nFour\n\nFive\n", schema)
    const positions = blockPositions(EditorState.create({ doc }))
    let state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    state = state.apply(
      state.tr
        .setMeta(multiBlockSelectionKey, {
          selectedBlocks: [positions[0]],
          anchorBlock: positions[0]
        })
        .setSelection(NodeSelection.create(state.doc, positions[0]!))
    )

    expect(extendBlockSelection("down")(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(selectedText(state)).toEqual(["One", "Two"])

    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    selectBlock(view, positions[3]!, "toggle")
    expect(selectedText(state)).toEqual(["One", "Two", "Four"])

    expect(extendBlockSelection("down")(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(selectedText(state)).toEqual(["One", "Two", "Four", "Five"])

    expect(extendBlockSelection("up")(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(selectedText(state)).toEqual(["One", "Two", "Four"])
  })

  it("toggles non-contiguous blocks and clears the native node highlight when the last block is removed", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n\nFour\n", schema)
    const positions = blockPositions(EditorState.create({ doc }))
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, positions[0]! + 1),
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView

    selectBlock(view, positions[0]!, "toggle")
    selectBlock(view, positions[2]!, "toggle")
    selectBlock(view, positions[3]!, "toggle")
    expect(selectedText(state)).toEqual(["One", "Three", "Four"])

    selectBlock(view, positions[2]!, "toggle")
    expect(selectedText(state)).toEqual(["One", "Four"])

    selectBlock(view, positions[0]!, "toggle")
    selectBlock(view, positions[3]!, "toggle")
    expect(selectedText(state)).toEqual([])
    expect(state.selection).toBeInstanceOf(TextSelection)
  })

  it("extends a block selection to the document edge with Shift-Cmd-Arrow", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n\nFour\n", schema)
    const plugin = multiBlockSelectionPlugin(schema)
    const initial = EditorState.create({ doc })
    const positions = blockPositions(initial)
    let state = EditorState.create({ doc, plugins: [plugin] })
    state = state.apply(state.tr.setMeta(multiBlockSelectionKey, {
      selectedBlocks: [positions[1]],
      anchorBlock: positions[1]
    }))
    let prevented = false
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView

    expect(plugin.props.handleKeyDown?.call(plugin, view, {
      key: "ArrowDown",
      shiftKey: true,
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      preventDefault() { prevented = true }
    } as KeyboardEvent)).toBe(true)
    expect(prevented).toBe(true)
    expect(selectedText(state)).toEqual(["Two", "Three", "Four"])

    expect(plugin.props.handleKeyDown?.call(plugin, view, {
      key: "ArrowUp",
      shiftKey: true,
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      preventDefault() {}
    } as KeyboardEvent)).toBe(true)
    expect(selectedText(state)).toEqual(["One", "Two", "Three", "Four"])
  })

  it("leaves inline Shift-Arrow behavior to ProseMirror", () => {
    const plugin = multiBlockSelectionPlugin(schema)
    const doc = parseMarkdown("One\n\nTwo\n", schema)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 3),
      plugins: [plugin]
    })
    const view = { state } as EditorView

    expect(plugin.props.handleKeyDown?.call(plugin, view, {
      key: "ArrowDown",
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
      altKey: false
    } as KeyboardEvent)).toBe(false)
    expect(plugin.props.handleKeyDown?.call(plugin, view, {
      key: "ArrowUp",
      shiftKey: true,
      metaKey: true,
      ctrlKey: false,
      altKey: false
    } as KeyboardEvent)).toBe(false)
  })
})

describe("live editor block duplication", () => {
  it("duplicates the cursor's whole block and selects the duplicate", () => {
    const state = placeCursor(editorState("One\n\nTwo\n\nThree\n"), 1)
    const transaction = createDuplicateBlocksTransaction(state)

    expect(transaction).not.toBeNull()
    expect(serializeMarkdown(transaction!.doc)).toBe("One\n\nTwo\n\nTwo\n\nThree\n")

    const nextState = state.apply(transaction!)
    expect(nextState.selection).toBeInstanceOf(NodeSelection)
    expect(multiBlockSelectionKey.getState(nextState)?.selectedBlocks.map(
      (pos) => nextState.doc.nodeAt(pos)?.textContent
    )).toEqual(["Two"])
  })

  it("duplicates the explicit block selection instead of the cursor's block", () => {
    let state = placeCursor(editorState("One\n\nTwo\n\nThree\n\nFour\n"), 3)
    const positions = blockPositions(state)
    state = state.apply(state.tr.setMeta(multiBlockSelectionKey, {
      selectedBlocks: [positions[1]!, positions[2]!],
      anchorBlock: positions[1]!
    }))

    expect(duplicateBlocks(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(serializeMarkdown(state.doc)).toBe("One\n\nTwo\n\nThree\n\nTwo\n\nThree\n\nFour\n")
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks.map(
      (pos) => state.doc.nodeAt(pos)?.textContent
    )).toEqual(["Two", "Three"])
  })
})

describe("live editor staged Select All", () => {
  it("selects every block directly for the no-caret app fallback", () => {
    let state = placeCursor(editorState("One\n\nTwo\n\nThree\n"), 1)

    expect(selectEveryBlock(state, (transaction) => { state = state.apply(transaction) }))
      .toBe(true)
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks.map(
      (pos) => state.doc.nodeAt(pos)?.textContent
    )).toEqual(["One", "Two", "Three"])
  })

  it("selects and highlights the current block, then every block", () => {
    let state = placeCursor(editorState("One\n\nTwo\n\nThree\n"), 1)

    expect(selectAllBlocksInStages(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(state.selection).toBeInstanceOf(NodeSelection)
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks.map((pos) => state.doc.nodeAt(pos)?.textContent)).toEqual(["Two"])

    expect(selectAllBlocksInStages(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks.map((pos) => state.doc.nodeAt(pos)?.textContent)).toEqual([
      "One",
      "Two",
      "Three"
    ])
  })

  it("keeps staged selection on Mod-A and uses Mod-/ only for the menu", () => {
    const blockShortcutKeymap = buildKeymap(schema)
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n", schema)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6),
      plugins: [multiBlockSelectionPlugin(schema), blockShortcutKeymap]
    })
    const contextMenuIntents: unknown[] = []
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        contextMenuIntents.push(
          transaction.getMeta(BLOCK_CONTEXT_MENU_INTENT_META)
        )
        state = state.apply(transaction)
      }
    } as unknown as EditorView
    const event = (
      key: string,
      modifiers: Partial<KeyboardEvent>
    ): KeyboardEvent => ({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault() {},
      stopPropagation() {},
      ...modifiers
    }) as KeyboardEvent

    expect(blockShortcutKeymap.props.handleKeyDown?.call(
      blockShortcutKeymap,
      view,
      event("a", { ctrlKey: true })
    )).toBe(true)
    expect(state.selection).toBeInstanceOf(NodeSelection)
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks.map(
      (pos) => state.doc.nodeAt(pos)?.textContent
    )).toEqual(["Two"])
    expect(contextMenuIntents.at(-1)).toBe("close")

    expect(blockShortcutKeymap.props.handleKeyDown?.call(
      blockShortcutKeymap,
      view,
      event("/", { ctrlKey: true })
    )).toBe(true)
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks.map(
      (pos) => state.doc.nodeAt(pos)?.textContent
    )).toEqual(["Two"])
    expect(contextMenuIntents.at(-1)).toBe("toggle")

    expect(blockShortcutKeymap.props.handleKeyDown?.call(
      blockShortcutKeymap,
      view,
      event("a", { ctrlKey: true })
    )).toBe(true)
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks.map(
      (pos) => state.doc.nodeAt(pos)?.textContent
    )).toEqual(["One", "Two", "Three"])
    expect(contextMenuIntents.at(-1)).toBe("close")
  })
})

describe("live editor multi-item indentation", () => {
  function keyboardEvent(
    key: "Tab" | "z",
    modifiers: Partial<KeyboardEvent> = {}
  ): KeyboardEvent {
    return {
      key,
      keyCode: key === "Tab" ? 9 : 0,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault() {},
      stopPropagation() {},
      ...modifiers
    } as KeyboardEvent
  }

  function applyKey(
    keymapPlugin: ReturnType<typeof buildKeymap>,
    view: EditorView,
    event: KeyboardEvent
  ): boolean {
    return keymapPlugin.props.handleKeyDown?.call(
      keymapPlugin,
      view,
      event
    ) ?? false
  }

  function listItem(
    typeName: "bullet_item" | "numbered_item" | "task_item",
    text: string,
    indent: number,
    checked = false
  ) {
    return schema.nodes[typeName]!.create(
      typeName === "task_item" ? { indent, checked } : { indent },
      schema.text(text)
    )
  }

  function viewFor(
    doc: EditorState["doc"],
    selection: TextSelection | NodeSelection,
    includeHistory = false
  ) {
    const keymapPlugin = buildKeymap(schema)
    let state = EditorState.create({
      doc,
      selection,
      plugins: [
        ...(includeHistory ? [history()] : []),
        multiBlockSelectionPlugin(schema),
        keymapPlugin
      ]
    })
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView
    return { keymapPlugin, view, state: () => state }
  }

  function indents(state: EditorState): Array<number | null> {
    const listTypes = new Set(["bullet_item", "numbered_item", "task_item"])
    return Array.from({ length: state.doc.childCount }, (_, index) => {
      const node = state.doc.child(index)
      return listTypes.has(node.type.name) ? node.attrs.indent : null
    })
  }

  it("indents every list item touched by a forward text range and preserves its selection", () => {
    const root = listItem("bullet_item", "Root", 0)
    const bullet = listItem("bullet_item", "Bullet", 0)
    const numbered = listItem("numbered_item", "Numbered", 1)
    const task = listItem("task_item", "Task", 2, true)
    const doc = schema.nodes.doc!.create(null, [root, bullet, numbered, task])
    const positions = blockPositions(EditorState.create({ doc }))
    const anchor = positions[1]! + 2
    const head = positions[3]! + 3
    const { keymapPlugin, view, state } = viewFor(
      doc,
      TextSelection.create(doc, anchor, head)
    )

    expect(applyKey(keymapPlugin, view, keyboardEvent("Tab"))).toBe(true)
    expect(indents(state())).toEqual([0, 1, 2, 3])
    expect(state().doc.child(3).attrs.checked).toBe(true)
    expect(state().selection).toBeInstanceOf(TextSelection)
    expect(state().selection.anchor).toBe(anchor)
    expect(state().selection.head).toBe(head)
  })

  it("outdents every list item touched by a reverse text range and preserves its direction", () => {
    const bullet = listItem("bullet_item", "Bullet", 1)
    const numbered = listItem("numbered_item", "Numbered", 2)
    const task = listItem("task_item", "Task", 3, true)
    const doc = schema.nodes.doc!.create(null, [bullet, numbered, task])
    const positions = blockPositions(EditorState.create({ doc }))
    const anchor = positions[2]! + 3
    const head = positions[0]! + 2
    const { keymapPlugin, view, state } = viewFor(
      doc,
      TextSelection.create(doc, anchor, head)
    )

    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("Tab", { shiftKey: true })
    )).toBe(true)
    expect(indents(state())).toEqual([0, 1, 2])
    expect(state().selection.anchor).toBe(anchor)
    expect(state().selection.head).toBe(head)
  })

  it("indents non-contiguous explicit selections and preserves their block highlights and Markdown", () => {
    const bold = schema.marks.bold!.create()
    const nodes = [
      listItem("bullet_item", "Root", 0),
      schema.nodes.bullet_item!.create(
        { indent: 0 },
        schema.text("Bullet", [bold])
      ),
      listItem("bullet_item", "Bullet peer", 1),
      listItem("numbered_item", "Numbered", 1),
      listItem("numbered_item", "Numbered peer", 2),
      listItem("task_item", "Task", 2, true)
    ]
    const doc = schema.nodes.doc!.create(null, nodes)
    const positions = blockPositions(EditorState.create({ doc }))
    const selectedBlocks = [positions[1]!, positions[3]!, positions[5]!]
    const setup = viewFor(doc, NodeSelection.create(doc, positions[1]!), true)
    setup.view.dispatch(
      setup.state().tr
        .setMeta(multiBlockSelectionKey, {
          selectedBlocks,
          anchorBlock: selectedBlocks[0]
        })
        .setMeta("multiBlockKeep", true)
    )

    expect(applyKey(setup.keymapPlugin, setup.view, keyboardEvent("Tab"))).toBe(true)
    expect(indents(setup.state())).toEqual([0, 1, 1, 2, 2, 3])
    expect(setup.state().doc.child(1).firstChild?.marks.some(
      (mark) => mark.type === schema.marks.bold
    )).toBe(true)
    expect(setup.state().doc.child(5).attrs.checked).toBe(true)
    expect(multiBlockSelectionKey.getState(setup.state())?.selectedBlocks).toEqual(
      selectedBlocks
    )
    expect(multiBlockSelectionKey.getState(setup.state())?.selectedBlocks.map(
      (pos) => setup.state().doc.nodeAt(pos)?.textContent
    )).toEqual(["Bullet", "Numbered", "Task"])

    const markdown = serializeMarkdown(setup.state().doc)
    const roundtrip = parseMarkdown(markdown, schema)
    expect(indents(EditorState.create({ doc: roundtrip }))).toEqual([0, 1, 1, 2, 2, 3])
    expect(roundtrip.child(1).firstChild?.marks.some(
      (mark) => mark.type === schema.marks.bold
    )).toBe(true)
    expect(roundtrip.child(5).attrs.checked).toBe(true)

    expect(applyKey(
      setup.keymapPlugin,
      setup.view,
      keyboardEvent("z", { ctrlKey: true })
    )).toBe(true)
    expect(indents(setup.state())).toEqual([0, 0, 1, 1, 2, 2])

    expect(applyKey(
      setup.keymapPlugin,
      setup.view,
      keyboardEvent("z", { ctrlKey: true, shiftKey: true })
    )).toBe(true)
    expect(indents(setup.state())).toEqual([0, 1, 1, 2, 2, 3])
  })

  it("outdents a contiguous explicit selection without clearing it", () => {
    const nodes = [
      listItem("bullet_item", "Bullet", 1),
      listItem("numbered_item", "Numbered", 2),
      listItem("task_item", "Task", 3, true)
    ]
    const doc = schema.nodes.doc!.create(null, nodes)
    const positions = blockPositions(EditorState.create({ doc }))
    const setup = viewFor(doc, NodeSelection.create(doc, positions[0]!))
    setup.view.dispatch(
      setup.state().tr
        .setMeta(multiBlockSelectionKey, {
          selectedBlocks: positions,
          anchorBlock: positions[0]
        })
        .setMeta("multiBlockKeep", true)
    )

    expect(applyKey(
      setup.keymapPlugin,
      setup.view,
      keyboardEvent("Tab", { shiftKey: true })
    )).toBe(true)
    expect(indents(setup.state())).toEqual([0, 1, 2])
    expect(setup.state().selection).toBeInstanceOf(NodeSelection)
    expect(multiBlockSelectionKey.getState(setup.state())?.selectedBlocks).toEqual(
      positions
    )
  })

  it("changes only eligible items in a mixed text selection", () => {
    const bullet = listItem("bullet_item", "Bullet", 0)
    const paragraph = schema.nodes.paragraph!.create(null, schema.text("Paragraph"))
    const task = listItem("task_item", "Task", 1, true)
    const doc = schema.nodes.doc!.create(null, [bullet, paragraph, task])
    const positions = blockPositions(EditorState.create({ doc }))
    const { keymapPlugin, view, state } = viewFor(
      doc,
      TextSelection.create(doc, positions[0]! + 1, positions[2]! + 2)
    )

    expect(applyKey(keymapPlugin, view, keyboardEvent("Tab"))).toBe(true)
    expect(indents(state())).toEqual([1, null, 2])
    expect(state().doc.child(1)).toBe(paragraph)
  })

  it("leaves code and tables untouched when a mixed range also contains list items", () => {
    const code = schema.nodes.code_block!.create(
      { language: "text" },
      schema.text("Code")
    )
    const codeList = listItem("bullet_item", "List after code", 0)
    const codeDoc = schema.nodes.doc!.create(null, [code, codeList])
    const codePositions = blockPositions(EditorState.create({ doc: codeDoc }))
    const codeSetup = viewFor(
      codeDoc,
      TextSelection.create(codeDoc, 2, codePositions[1]! + 2)
    )

    expect(applyKey(
      codeSetup.keymapPlugin,
      codeSetup.view,
      keyboardEvent("Tab")
    )).toBe(true)
    expect(codeSetup.state().doc.child(0).textContent).toBe("Code")
    expect(indents(codeSetup.state())).toEqual([null, 1])

    const firstCell = schema.nodes.table_cell!.create(null, schema.text("First"))
    const secondCell = schema.nodes.table_cell!.create(null, schema.text("Second"))
    const row = schema.nodes.table_row!.create(null, [firstCell, secondCell])
    const table = schema.nodes.table!.create(null, row)
    const tableList = listItem("task_item", "List after table", 1, true)
    const tableDoc = schema.nodes.doc!.create(null, [table, tableList])
    const tablePositions = blockPositions(EditorState.create({ doc: tableDoc }))
    const tableSetup = viewFor(
      tableDoc,
      TextSelection.create(tableDoc, tablePositions[1]! + 2, 3)
    )

    expect(applyKey(
      tableSetup.keymapPlugin,
      tableSetup.view,
      keyboardEvent("Tab", { shiftKey: true })
    )).toBe(true)
    expect(tableSetup.state().doc.child(0)).toBe(table)
    expect(indents(tableSetup.state())).toEqual([null, 0])
  })

  it("caps and floors each selected item independently", () => {
    const indentDoc = schema.nodes.doc!.create(null, [
      listItem("bullet_item", "At max", 4),
      listItem("numbered_item", "Can move", 3)
    ])
    const indentSetup = viewFor(
      indentDoc,
      TextSelection.create(indentDoc, 1, indentDoc.content.size - 1)
    )

    expect(applyKey(
      indentSetup.keymapPlugin,
      indentSetup.view,
      keyboardEvent("Tab")
    )).toBe(true)
    expect(indents(indentSetup.state())).toEqual([4, 4])
    expect(applyKey(
      indentSetup.keymapPlugin,
      indentSetup.view,
      keyboardEvent("Tab")
    )).toBe(false)

    const outdentDoc = schema.nodes.doc!.create(null, [
      listItem("bullet_item", "At floor", 0),
      listItem("task_item", "Can move", 1, true)
    ])
    const outdentSetup = viewFor(
      outdentDoc,
      TextSelection.create(outdentDoc, 1, outdentDoc.content.size - 1)
    )

    expect(applyKey(
      outdentSetup.keymapPlugin,
      outdentSetup.view,
      keyboardEvent("Tab", { shiftKey: true })
    )).toBe(true)
    expect(indents(outdentSetup.state())).toEqual([0, 0])
    expect(applyKey(
      outdentSetup.keymapPlugin,
      outdentSetup.view,
      keyboardEvent("Tab", { shiftKey: true })
    )).toBe(false)
  })

  it("records the complete multi-item change as one undo and redo event", () => {
    const nodes = [
      listItem("bullet_item", "Bullet", 0),
      listItem("numbered_item", "Numbered", 1),
      listItem("task_item", "Task", 2, true)
    ]
    const doc = schema.nodes.doc!.create(null, nodes)
    const { keymapPlugin, view, state } = viewFor(
      doc,
      TextSelection.create(doc, 1, doc.content.size - 1),
      true
    )

    expect(applyKey(keymapPlugin, view, keyboardEvent("Tab"))).toBe(true)
    expect(indents(state())).toEqual([1, 2, 3])

    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("z", { ctrlKey: true })
    )).toBe(true)
    expect(indents(state())).toEqual([0, 1, 2])

    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("z", { ctrlKey: true, shiftKey: true })
    )).toBe(true)
    expect(indents(state())).toEqual([1, 2, 3])
  })

  it("retains single-list, code, and table Tab priorities", () => {
    const singleDoc = schema.nodes.doc!.create(
      null,
      listItem("bullet_item", "Single", 0)
    )
    const single = viewFor(singleDoc, TextSelection.create(singleDoc, 2))
    expect(applyKey(single.keymapPlugin, single.view, keyboardEvent("Tab"))).toBe(true)
    expect(indents(single.state())).toEqual([1])

    const code = schema.nodes.code_block!.create(
      { language: "text" },
      schema.text("Code")
    )
    const codeDoc = schema.nodes.doc!.create(null, code)
    const codeSetup = viewFor(codeDoc, TextSelection.create(codeDoc, 3))
    expect(applyKey(codeSetup.keymapPlugin, codeSetup.view, keyboardEvent("Tab"))).toBe(true)
    expect(codeSetup.state().doc.textContent).toBe("Co\tde")

    const firstCell = schema.nodes.table_cell!.create(null, schema.text("First"))
    const secondCell = schema.nodes.table_cell!.create(null, schema.text("Second"))
    const row = schema.nodes.table_row!.create(null, [firstCell, secondCell])
    const table = schema.nodes.table!.create(null, row)
    const tableDoc = schema.nodes.doc!.create(null, table)
    const tableSetup = viewFor(tableDoc, TextSelection.create(tableDoc, 3))
    expect(applyKey(tableSetup.keymapPlugin, tableSetup.view, keyboardEvent("Tab"))).toBe(true)
    expect(tableSetup.state().selection.$from.parent.textContent).toBe("Second")
    expect(applyKey(
      tableSetup.keymapPlugin,
      tableSetup.view,
      keyboardEvent("Tab", { shiftKey: true })
    )).toBe(true)
    expect(tableSetup.state().selection.$from.parent.textContent).toBe("First")
  })

  it("returns native Tab fallback when an explicit selection has no eligible change", () => {
    const paragraph = schema.nodes.paragraph!.create(null, schema.text("Paragraph"))
    const doc = schema.nodes.doc!.create(null, paragraph)
    const setup = viewFor(doc, NodeSelection.create(doc, 0))
    setup.view.dispatch(
      setup.state().tr
        .setMeta(multiBlockSelectionKey, {
          selectedBlocks: [0],
          anchorBlock: 0
        })
        .setMeta("multiBlockKeep", true)
    )
    let dispatched = false
    const fallbackView = {
      get state() {
        return setup.state()
      },
      dispatch() {
        dispatched = true
      }
    } as unknown as EditorView

    expect(applyKey(
      setup.keymapPlugin,
      fallbackView,
      keyboardEvent("Tab")
    )).toBe(false)
    expect(dispatched).toBe(false)
  })
})

describe("live editor shared history and structural insertion shortcuts", () => {
  function keyboardEvent(
    key: string,
    modifiers: Partial<KeyboardEvent> = {}
  ): KeyboardEvent {
    return {
      key,
      keyCode: key === "Enter" ? 13 : 0,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault() {},
      stopPropagation() {},
      ...modifiers
    } as KeyboardEvent
  }

  function applyKey(
    keymapPlugin: ReturnType<typeof buildKeymap>,
    view: EditorView,
    event: KeyboardEvent
  ): boolean {
    return keymapPlugin.props.handleKeyDown?.call(
      keymapPlugin,
      view,
      event
    ) ?? false
  }

  it("routes Cmd/Ctrl-Z and redo through the same ProseMirror history", () => {
    const keymapPlugin = buildKeymap(schema)
    const paragraph = schema.nodes.paragraph!.create(null, schema.text("One"))
    const doc = schema.nodes.doc!.create(null, paragraph)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 4),
      plugins: [history(), keymapPlugin]
    })
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView

    view.dispatch(state.tr.insertText("!"))
    expect(state.doc.textContent).toBe("One!")

    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("z", { ctrlKey: true })
    )).toBe(true)
    expect(state.doc.textContent).toBe("One")

    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("z", { ctrlKey: true, shiftKey: true })
    )).toBe(true)
    expect(state.doc.textContent).toBe("One!")
  })

  it("reserves Cmd/Ctrl-K for global search and opens links with Shift added", () => {
    const keymapPlugin = buildKeymap(schema)
    const paragraph = schema.nodes.paragraph!.create(null, schema.text("Link me"))
    const doc = schema.nodes.doc!.create(null, paragraph)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 8),
      plugins: [selectionToolbarPlugin(schema), keymapPlugin]
    })
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView

    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("k", { ctrlKey: true })
    )).toBe(false)
    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("k", { ctrlKey: true, shiftKey: true })
    )).toBe(true)
    expect(selectionToolbarPluginKey.getState(state)).toMatchObject({
      linkEditorRequestRevision: 1
    })
  })

  it.each(["code_block", "mermaid"])(
    "moves Mod-Arrow to the %s boundary before the document boundary",
    (typeName) => {
      const keymapPlugin = buildKeymap(schema)
      const before = schema.nodes.paragraph!.create(null, schema.text("Before"))
      const source = schema.nodes[typeName]!.create(
        typeName === "code_block"
          ? { language: "typescript" }
          : { mode: "edit" },
        schema.text("line one\nline two")
      )
      const after = schema.nodes.paragraph!.create(null, schema.text("After"))
      const doc = schema.nodes.doc!.create(null, [before, source, after])
      const sourceStart = before.nodeSize
      let state = EditorState.create({
        doc,
        selection: TextSelection.create(doc, sourceStart + 5),
        plugins: [keymapPlugin]
      })
      const view = {
        get state() {
          return state
        },
        dispatch(transaction: Transaction) {
          state = state.apply(transaction)
        }
      } as unknown as EditorView

      expect(applyKey(
        keymapPlugin,
        view,
        keyboardEvent("ArrowDown", { ctrlKey: true })
      )).toBe(true)
      expect(state.selection.$from.parent.type.name).toBe(typeName)
      expect(state.selection.$from.parentOffset).toBe(source.content.size)
      expect(applyKey(
        keymapPlugin,
        view,
        keyboardEvent("ArrowDown", { ctrlKey: true })
      )).toBe(false)

      state = state.apply(
        state.tr.setSelection(TextSelection.create(state.doc, sourceStart + 5))
      )
      expect(applyKey(
        keymapPlugin,
        view,
        keyboardEvent("ArrowUp", { ctrlKey: true })
      )).toBe(true)
      expect(state.selection.$from.parent.type.name).toBe(typeName)
      expect(state.selection.$from.parentOffset).toBe(0)
      expect(applyKey(
        keymapPlugin,
        view,
        keyboardEvent("ArrowUp", { ctrlKey: true })
      )).toBe(false)
    }
  )

  it("leaves Mod-Arrow navigation unchanged outside code content", () => {
    const keymapPlugin = buildKeymap(schema)
    const paragraph = schema.nodes.paragraph!.create(null, schema.text("Text"))
    const doc = schema.nodes.doc!.create(null, paragraph)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
      plugins: [keymapPlugin]
    })
    const view = { state } as EditorView

    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("ArrowDown", { ctrlKey: true })
    )).toBe(false)
    expect(applyKey(
      keymapPlugin,
      view,
      keyboardEvent("ArrowUp", { ctrlKey: true })
    )).toBe(false)
  })

  it.each([
    ["after", false, ["One", "Two", ""]],
    ["before", true, ["One", "", "Two"]]
  ] as const)(
    "adds a paragraph %s the current block with the toolbar-equivalent shortcut",
    (_direction, shiftKey, expectedBlocks) => {
      const keymapPlugin = buildKeymap(schema)
      const first = schema.nodes.paragraph!.create(null, schema.text("One"))
      const second = schema.nodes.paragraph!.create(null, schema.text("Two"))
      const doc = schema.nodes.doc!.create(null, [first, second])
      let state = EditorState.create({
        doc,
        selection: TextSelection.create(doc, first.nodeSize + 1),
        plugins: [keymapPlugin]
      })
      const view = {
        get state() {
          return state
        },
        dispatch(transaction: Transaction) {
          state = state.apply(transaction)
        }
      } as unknown as EditorView

      expect(applyKey(
        keymapPlugin,
        view,
        keyboardEvent("Enter", { ctrlKey: true, shiftKey })
      )).toBe(true)
      expect(Array.from(
        { length: state.doc.childCount },
        (_, index) => state.doc.child(index).textContent
      )).toEqual(expectedBlocks)
      expect(state.selection.$from.parent.textContent).toBe("")
    }
  )
})

describe("live editor blank block deletion", () => {
  it("removes an empty paragraph and moves into the remaining content", () => {
    const empty = schema.nodes.paragraph!.create()
    const content = schema.nodes.paragraph!.create(null, schema.text("Keep me"))
    const doc = schema.nodes.doc!.create(null, [empty, content])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1)
    })

    expect(removeEmptyParagraphBlock(schema)(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.textContent).toBe("Keep me")
    expect(state.selection.$from.parent.textContent).toBe("Keep me")
    expect(state.selection.$from.parentOffset).toBe(0)
  })

  it("keeps the only empty paragraph so the document remains editable", () => {
    const state = editorState("")
    expect(removeEmptyParagraphBlock(schema)(state)).toBe(false)
  })

  it("removes a trailing empty paragraph and returns to the previous block's end", () => {
    const content = schema.nodes.paragraph!.create(null, schema.text("Keep me"))
    const empty = schema.nodes.paragraph!.create()
    const doc = schema.nodes.doc!.create(null, [content, empty])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, content.nodeSize + 1)
    })

    expect(removeEmptyParagraphBlock(schema)(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.selection.$from.parent.textContent).toBe("Keep me")
    expect(state.selection.$from.parentOffset).toBe("Keep me".length)
  })

  it("removes a middle empty paragraph and returns to the previous block's end", () => {
    const previous = schema.nodes.paragraph!.create(null, schema.text("Previous"))
    const empty = schema.nodes.paragraph!.create()
    const next = schema.nodes.paragraph!.create(null, schema.text("Next"))
    const doc = schema.nodes.doc!.create(null, [previous, empty, next])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, previous.nodeSize + 1)
    })

    expect(removeEmptyParagraphBlock(schema)(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(state.doc.childCount).toBe(2)
    expect(state.selection.$from.parent).toBe(state.doc.firstChild)
    expect(state.selection.$from.parentOffset).toBe("Previous".length)
  })

  it("resets an empty heading to a paragraph without touching the previous row", () => {
    const content = schema.nodes.paragraph!.create(null, schema.text("Keep me"))
    const heading = schema.nodes.heading!.create({ level: 2 })
    const doc = schema.nodes.doc!.create(null, [content, heading])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, content.nodeSize + 1)
    })

    expect(resetEmptyFormattedBlock(schema)(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(state.doc.childCount).toBe(2)
    expect(state.doc.firstChild).toBe(content)
    expect(state.doc.lastChild?.type).toBe(schema.nodes.paragraph)
    expect(state.selection.$from.parent).toBe(state.doc.lastChild)
    expect(state.selection.$from.parentOffset).toBe(0)
  })

  it.each([
    ["database_embed", { source: "Projects" }],
    ["horizontal_rule", null]
  ])(
    "removes a blank paragraph after %s and preserves a trailing structural caret",
    (typeName, attrs) => {
      const boundary = schema.nodes[typeName]!.create(attrs)
      const empty = schema.nodes.paragraph!.create()
      const doc = schema.nodes.doc!.create(null, [boundary, empty])
      let state = EditorState.create({
        doc,
        selection: TextSelection.create(doc, boundary.nodeSize + 1),
        plugins: [inactiveBlockSelectionPlugin()]
      })
      let deactivatesSelection = false

      expect(removeEmptyParagraphBlock(schema)(state, (transaction) => {
        deactivatesSelection = transactionLeavesEditorInactive(transaction)
        state = state.apply(transaction)
      })).toBe(true)
      expect(deactivatesSelection).toBe(false)
      expect(state.doc.childCount).toBe(1)
      expect(state.doc.firstChild).toBe(boundary)
      expect(inactiveBlockSelectionKey.getState(state)).toBe(false)
      expect(state.selection).toBeInstanceOf(StructuralCaretSelection)
      expect((state.selection as StructuralCaretSelection).side).toBe("after")
      expect(state.selection.from).toBe(boundary.nodeSize)

      const paragraphPos = state.doc.content.size
      let activateTransaction = state.tr.insert(
        paragraphPos,
        schema.nodes.paragraph!.create()
      )
      activateTransaction = activateTransaction.setSelection(
        TextSelection.create(activateTransaction.doc, paragraphPos + 1)
      )
      state = state.apply(activateTransaction)
      expect(inactiveBlockSelectionKey.getState(state)).toBe(false)
    }
  )

  it("removes a blank paragraph after Mermaid and keeps its code caret active", () => {
    const code = "graph TD; A-->B"
    const boundary = schema.nodes.mermaid!.create(
      { mode: "edit" },
      schema.text(code)
    )
    const empty = schema.nodes.paragraph!.create()
    const doc = schema.nodes.doc!.create(null, [boundary, empty])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, boundary.nodeSize + 1),
      plugins: [inactiveBlockSelectionPlugin()]
    })

    expect(removeEmptyParagraphBlock(schema)(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild).toBe(boundary)
    expect(inactiveBlockSelectionKey.getState(state)).toBe(false)
    expect(state.selection).toBeInstanceOf(TextSelection)
    expect(state.selection.$from.parent).toBe(boundary)
    expect(state.selection.$from.parentOffset).toBe(code.length)
  })

  it("keeps the file embed caretless when removing its trailing blank paragraph", () => {
    const boundary = schema.nodes.file_embed!.create({ src: "spec.pdf" })
    const empty = schema.nodes.paragraph!.create()
    const doc = schema.nodes.doc!.create(null, [boundary, empty])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, boundary.nodeSize + 1),
      plugins: [inactiveBlockSelectionPlugin()]
    })
    let deactivatesSelection = false

    expect(removeEmptyParagraphBlock(schema)(state, (transaction) => {
      deactivatesSelection = transactionLeavesEditorInactive(transaction)
      state = state.apply(transaction)
    })).toBe(true)
    expect(deactivatesSelection).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild).toBe(boundary)
    expect(inactiveBlockSelectionKey.getState(state)).toBe(true)
    expect(state.selection).toBeInstanceOf(NodeSelection)
  })

  it.each(["bullet_item", "numbered_item", "task_item"])(
    "exits an empty %s into a blank paragraph in the same position",
    (typeName) => {
      const content = schema.nodes.paragraph!.create(null, schema.text("Keep me"))
      const attrs = typeName === "task_item" ? { indent: 0, checked: false } : { indent: 0 }
      const emptyItem = schema.nodes[typeName]!.create(attrs)
      const doc = schema.nodes.doc!.create(null, [content, emptyItem])
      let state = EditorState.create({
        doc,
        selection: TextSelection.create(doc, content.nodeSize + 1)
      })

      expect(resetEmptyFormattedBlock(schema)(state, (transaction) => {
        state = state.apply(transaction)
      })).toBe(true)
      expect(state.doc.childCount).toBe(2)
      expect(state.doc.firstChild?.textContent).toBe("Keep me")
      expect(state.doc.lastChild?.type).toBe(schema.nodes.paragraph)
      expect(state.doc.lastChild?.content.size).toBe(0)
      expect(state.selection.$from.parent).toBe(state.doc.lastChild)
      expect(state.selection.$from.parentOffset).toBe(0)
    }
  )

  it("turns the only empty list item into an editable paragraph", () => {
    const item = schema.nodes.bullet_item!.create({ indent: 0 })
    const doc = schema.nodes.doc!.create(null, item)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1)
    })

    expect(resetEmptyFormattedBlock(schema)(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(state.selection.from).toBe(1)
  })
})

describe("live editor empty list continuation", () => {
  it.each(["bullet_item", "numbered_item", "task_item"])(
    "preserves an empty %s and creates a new item on Enter",
    (typeName) => {
      const attrs = typeName === "task_item"
        ? { indent: 1, checked: true }
        : { indent: 1 }
      const item = schema.nodes[typeName]!.create(attrs)
      const doc = schema.nodes.doc!.create(null, item)
      let state = EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1)
      })

      expect(splitFlatListItem(schema)(state, (transaction) => {
        state = state.apply(transaction)
      })).toBe(true)
      expect(state.doc.childCount).toBe(2)
      expect(state.doc.child(0).type.name).toBe(typeName)
      expect(state.doc.child(0).content.size).toBe(0)
      expect(state.doc.child(0).attrs.indent).toBe(1)
      expect(state.doc.child(1).type.name).toBe(typeName)
      expect(state.doc.child(1).content.size).toBe(0)
      expect(state.doc.child(1).attrs.indent).toBe(1)
      if (typeName === "task_item") {
        expect(state.doc.child(0).attrs.checked).toBe(true)
        expect(state.doc.child(1).attrs.checked).toBe(false)
      }
      expect(state.selection.$from.parent).toBe(state.doc.child(1))
    }
  )
})

describe("live editor code newline", () => {
  it("replaces a code selection with a literal newline inside the same fence", () => {
    const code = schema.nodes.code_block!.create(
      { language: "ts" },
      schema.text("alphaBETAgamma")
    )
    const doc = schema.nodes.doc!.create(null, code)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })

    expect(insertLiteralNewlineInCode(schema)(state, (transaction) => {
      state = state.apply(transaction)
    })).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(state.doc.firstChild?.attrs.language).toBe("ts")
    expect(state.doc.firstChild?.textContent).toBe("alpha\ngamma")
    expect(serializeMarkdown(state.doc)).toBe("```ts\nalpha\ngamma\n```\n")
  })

  it("keeps Shift-Enter as a hard break in prose", () => {
    let state = editorState("Paragraph\n")
    expect(insertLiteralNewlineInCode(schema)(state)).toBe(false)

    let view: { state: EditorState; dispatch: (transaction: Transaction) => void }
    view = {
      state,
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
        view.state = state
      }
    }
    const keymapPlugin = buildKeymap(schema)
    const handled = keymapPlugin.props.handleKeyDown?.call(
      keymapPlugin,
      view as never,
      {
        key: "Enter",
        keyCode: 13,
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
        metaKey: false
      } as KeyboardEvent
    )

    expect(handled).toBe(true)
    expect(state.doc.firstChild?.firstChild?.type).toBe(schema.nodes.hard_break)
    expect(state.doc.firstChild?.textContent).toBe("Paragraph")
  })
})

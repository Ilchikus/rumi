import { EditorState, NodeSelection, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { parseMarkdown } from "../markdown"
import { schema } from "../schema"
import {
  blockDragHandleKey,
  blockDragHandlePlugin
} from "./blockDragHandle"
import {
  BLOCK_CONTEXT_MENU_INTENT_META,
  blockSelectionForHandleContextMenu,
  blockContextMenuPosition,
  matchingBlockTypeOptions,
  shouldDeleteBlockFromMenu,
  shouldFocusBlockMenuSearchSynchronously,
  shouldRouteBlockSelectionTypingToSearch,
  shouldShowBlockMenuActionsForQuery,
  shouldToggleBlockContextMenuFromMenu
} from "./blockContextMenuModel"
import { createBlockTypeChangeTransaction } from "./blockTypeConversion"
import { BLOCK_TYPE_OPTIONS } from "./blockTypePresentation"
import {
  inactiveBlockSelectionKey,
  inactiveBlockSelectionPlugin,
  transactionLeavesEditorInactive
} from "../inactiveBlockSelection"
import {
  createDeleteSelectedBlocksTransaction,
  multiBlockSelectionKey,
  multiBlockSelectionPlugin,
  selectAllBlocksInStages
} from "./multiBlockSelection"

function selectedBlocks(state: EditorState): number[] {
  return multiBlockSelectionKey.getState(state)?.selectedBlocks ?? []
}

describe("selected-block handle menu trigger", () => {
  it("preserves selection when the context-clicked handle belongs to it", () => {
    expect(blockSelectionForHandleContextMenu([0, 5, 10], 5)).toEqual([0, 5, 10])
  })

  it("resets selection when the context-clicked handle is outside it", () => {
    expect(blockSelectionForHandleContextMenu([0, 5, 10], 15)).toEqual([15])
    expect(blockSelectionForHandleContextMenu([10], 15)).toEqual([15])
    expect(blockSelectionForHandleContextMenu([], 15)).toEqual([15])
  })

  it("does not retoggle during the Cmd+/ event that opened the menu", () => {
    const commandSlash = { key: "/", metaKey: true, ctrlKey: false }

    expect(shouldToggleBlockContextMenuFromMenu(
      true,
      false,
      commandSlash
    )).toBe(false)
    expect(shouldToggleBlockContextMenuFromMenu(
      true,
      true,
      commandSlash
    )).toBe(true)
    expect(shouldToggleBlockContextMenuFromMenu(
      false,
      true,
      commandSlash
    )).toBe(false)
    expect(shouldToggleBlockContextMenuFromMenu(
      true,
      true,
      { key: "a", metaKey: true, ctrlKey: false }
    )).toBe(false)
  })

  it("tracks explicit close and toggle intents as separate menu requests", () => {
    const doc = parseMarkdown("One\n", schema)
    const plugin = blockDragHandlePlugin(schema)
    let state = EditorState.create({ doc, plugins: [plugin] })

    state = state.apply(
      state.tr.setMeta(BLOCK_CONTEXT_MENU_INTENT_META, "close")
    )
    expect(blockDragHandleKey.getState(state)).toEqual({
      contextMenuIntent: "close",
      contextMenuIntentRevision: 1
    })

    state = state.apply(
      state.tr.setMeta(BLOCK_CONTEXT_MENU_INTENT_META, "toggle")
    )
    expect(blockDragHandleKey.getState(state)).toEqual({
      contextMenuIntent: "toggle",
      contextMenuIntentRevision: 2
    })
  })

  it("keeps an 8px gap between the selected-block menu and editor content", () => {
    expect(blockContextMenuPosition(
      { kind: "selection", contentStart: 420, top: 100 },
      { width: 220, height: 300 },
      { width: 1200, height: 900 }
    )).toEqual({ left: 192, top: 98 })
    expect(blockContextMenuPosition(
      { kind: "selection", contentStart: 420, top: 850 },
      { width: 220, height: 300 },
      { width: 1200, height: 900 }
    )).toEqual({ left: 192, top: 592 })
    expect(blockContextMenuPosition(
      { kind: "selection", contentStart: 180, top: 700 },
      { width: 220, height: 300 },
      { width: 200, height: 240 }
    )).toEqual({ left: 8, top: 8 })
  })

  it("keeps selected-block deletion available while the empty search is focused", () => {
    expect(shouldDeleteBlockFromMenu(true, true, "", "Backspace")).toBe(true)
    expect(shouldDeleteBlockFromMenu(true, true, "list", "Backspace")).toBe(false)
    expect(shouldDeleteBlockFromMenu(false, true, "", "Backspace")).toBe(false)
    expect(shouldDeleteBlockFromMenu(true, true, "", "Delete")).toBe(true)
  })

  it("clears block selection and places the cursor at the converted block's end", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n", schema)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.child(0).nodeSize + 1),
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    selectAllBlocksInStages(state, (transaction) => { state = state.apply(transaction) })

    const blockPos = selectedBlocks(state)[0]!
    const bulletOption = BLOCK_TYPE_OPTIONS.find(
      option => option.type === "bullet_item"
    )!
    const transaction = createBlockTypeChangeTransaction(
      state,
      [blockPos],
      bulletOption
    )
    expect(transaction).not.toBeNull()
    state = state.apply(transaction!)

    expect(selectedBlocks(state)).toEqual([])
    expect(state.selection).toBeInstanceOf(TextSelection)
    expect(state.selection.$from.parent.type).toBe(schema.nodes.bullet_item)
    expect(state.selection.$from.parentOffset).toBe("Two".length)
  })

  it("converts every selected block and leaves the cursor in the last one", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n", schema)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    selectAllBlocksInStages(state, (transaction) => {
      state = state.apply(transaction)
    })
    selectAllBlocksInStages(state, (transaction) => {
      state = state.apply(transaction)
    })

    const bulletOption = BLOCK_TYPE_OPTIONS.find(
      option => option.type === "bullet_item"
    )!
    const transaction = createBlockTypeChangeTransaction(
      state,
      selectedBlocks(state),
      bulletOption
    )
    expect(transaction).not.toBeNull()
    state = state.apply(transaction!)

    expect(Array.from(
      { length: state.doc.childCount },
      (_, index) => state.doc.child(index).type
    )).toEqual([
      schema.nodes.bullet_item,
      schema.nodes.bullet_item,
      schema.nodes.bullet_item
    ])
    expect(selectedBlocks(state)).toEqual([])
    expect(state.selection.$from.parent.textContent).toBe("Three")
    expect(state.selection.$from.parentOffset).toBe("Three".length)
  })

  it.each([
    ["bullet_item", ["bullet_item", "bullet_item", "bullet_item"]],
    ["numbered_item", ["numbered_item", "numbered_item", "numbered_item"]],
    ["task_item", ["task_item", "task_item", "task_item"]]
  ])("turns each visible line in one paragraph into a separate %s", (type, expectedTypes) => {
    const doc = parseMarkdown(
      "**First**\nSecond with [link](https://example.com)\nThird\n",
      schema
    )
    const state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    const option = BLOCK_TYPE_OPTIONS.find(candidate => candidate.type === type)!
    const transaction = createBlockTypeChangeTransaction(state, [0], option)

    expect(transaction).not.toBeNull()
    expect(Array.from(
      { length: transaction!.doc.childCount },
      (_, index) => transaction!.doc.child(index).type.name
    )).toEqual(expectedTypes)
    expect(transaction!.doc.child(0).firstChild?.marks.map(mark => mark.type.name)).toContain("bold")
    expect(transaction!.doc.child(1).content.content.some(node =>
      node.marks.some(mark => mark.type.name === "link")
    )).toBe(true)
    expect(transaction!.selection.$from.parent).toBe(transaction!.doc.lastChild)
    expect(transaction!.selection.$from.parentOffset).toBe("Third".length)
  })

  it.each(["bullet_item", "numbered_item", "task_item"])(
    "turns each single-column table row into a separate %s without flattening cell breaks",
    (type) => {
      const bold = schema.marks.bold!.create()
      const header = schema.nodes.table_header!.create(null, schema.text("Header"))
      const multilineCell = schema.nodes.table_cell!.create(null, [
        schema.text("First line"),
        schema.nodes.soft_break!.create(),
        schema.text("Second line", [bold])
      ])
      const lastCell = schema.nodes.table_cell!.create(null, schema.text("Last"))
      const table = schema.nodes.table!.create(null, [
        schema.nodes.table_row!.create(null, [header]),
        schema.nodes.table_row!.create(null, [multilineCell]),
        schema.nodes.table_row!.create(null, [lastCell])
      ])
      const doc = schema.nodes.doc!.create(null, [table])
      const state = EditorState.create({
        doc,
        plugins: [multiBlockSelectionPlugin(schema)]
      })
      const option = BLOCK_TYPE_OPTIONS.find(candidate => candidate.type === type)!
      const transaction = createBlockTypeChangeTransaction(state, [0], option)

      expect(transaction).not.toBeNull()
      expect(transaction!.doc.childCount).toBe(3)
      expect(Array.from(
        { length: transaction!.doc.childCount },
        (_, index) => transaction!.doc.child(index).type.name
      )).toEqual([type, type, type])
      expect(transaction!.doc.child(0).textContent).toBe("Header")
      expect(transaction!.doc.child(1).content.content.map(node => node.type.name)).toEqual([
        "text",
        "soft_break",
        "text"
      ])
      expect(transaction!.doc.child(1).lastChild?.marks).toContainEqual(bold)
      expect(transaction!.doc.child(2).textContent).toBe("Last")
    }
  )

  it("does not treat a spanning table cell as a single-column table", () => {
    const spanningHeader = schema.nodes.table_header!.create(
      { colspan: 2 },
      schema.text("Header")
    )
    const spanningCell = schema.nodes.table_cell!.create(
      { colspan: 2 },
      schema.text("Value")
    )
    const table = schema.nodes.table!.create(null, [
      schema.nodes.table_row!.create(null, [spanningHeader]),
      schema.nodes.table_row!.create(null, [spanningCell])
    ])
    const doc = schema.nodes.doc!.create(null, [table])
    const state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    const option = BLOCK_TYPE_OPTIONS.find(candidate => candidate.type === "bullet_item")!
    const transaction = createBlockTypeChangeTransaction(state, [0], option)

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.childCount).toBe(1)
    expect(transaction!.doc.firstChild?.type).toBe(schema.nodes.bullet_item)
    expect(transaction!.doc.firstChild?.textContent).toBe("HeaderValue")
  })

  it("replaces deleted selected blocks with one focused blank paragraph", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n", schema)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.child(0).nodeSize + 1),
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    selectAllBlocksInStages(state, (transaction) => { state = state.apply(transaction) })

    const transaction = createDeleteSelectedBlocksTransaction(state)
    expect(transaction).not.toBeNull()
    state = state.apply(transaction!)

    expect(Array.from(
      { length: state.doc.childCount },
      (_, index) => state.doc.child(index).textContent
    )).toEqual(["One", "", "Three"])
    expect(selectedBlocks(state)).toEqual([])
    expect(state.selection).toBeInstanceOf(TextSelection)
    expect(state.selection.$from.parent.type).toBe(schema.nodes.paragraph)
    expect(state.selection.$from.parent.content.size).toBe(0)
  })

  it.each([
    ["database_embed", { source: "Projects" }],
    ["file_embed", { src: "spec.pdf" }],
    ["horizontal_rule", null]
  ])(
    "fully removes a selected blank paragraph after %s and deactivates the editor",
    (typeName, attrs) => {
      const boundary = schema.nodes[typeName]!.create(attrs)
      const empty = schema.nodes.paragraph!.create()
      const doc = schema.nodes.doc!.create(null, [boundary, empty])
      const emptyPos = boundary.nodeSize
      let state = EditorState.create({
        doc,
        selection: NodeSelection.create(doc, emptyPos),
        plugins: [
          inactiveBlockSelectionPlugin(),
          multiBlockSelectionPlugin(schema)
        ]
      })
      state = state.apply(state.tr.setMeta(multiBlockSelectionKey, {
        selectedBlocks: [emptyPos],
        anchorBlock: emptyPos
      }))

      const transaction = createDeleteSelectedBlocksTransaction(state)
      expect(transaction).not.toBeNull()
      expect(transactionLeavesEditorInactive(transaction!)).toBe(true)
      state = state.apply(transaction!)

      expect(state.doc.childCount).toBe(1)
      expect(state.doc.firstChild).toBe(boundary)
      expect(selectedBlocks(state)).toEqual([])
      expect(inactiveBlockSelectionKey.getState(state)).toBe(true)
      expect(state.selection).toBeInstanceOf(NodeSelection)
      expect(state.selection.from).toBe(0)
    }
  )

  it("focuses search immediately for keyboard selection but preserves handle drag timing", () => {
    expect(shouldFocusBlockMenuSearchSynchronously(true, false)).toBe(true)
    expect(shouldFocusBlockMenuSearchSynchronously(true, true)).toBe(false)
    expect(shouldFocusBlockMenuSearchSynchronously(false, false)).toBe(false)
  })

  it("routes immediate printable input to selection-opened search", () => {
    const printable = {
      key: "c",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: false
    }

    expect(shouldRouteBlockSelectionTypingToSearch(
      true,
      false,
      printable
    )).toBe(true)
    expect(shouldRouteBlockSelectionTypingToSearch(
      true,
      true,
      printable
    )).toBe(false)
    expect(shouldRouteBlockSelectionTypingToSearch(
      false,
      false,
      printable
    )).toBe(false)
    expect(shouldRouteBlockSelectionTypingToSearch(
      true,
      false,
      { ...printable, key: "Enter" }
    )).toBe(false)
    expect(shouldRouteBlockSelectionTypingToSearch(
      true,
      false,
      { ...printable, metaKey: true }
    )).toBe(false)
    expect(shouldRouteBlockSelectionTypingToSearch(
      true,
      false,
      { ...printable, isComposing: true }
    )).toBe(false)
  })

  it("prioritizes matching block types from the first search character", () => {
    expect(matchingBlockTypeOptions("he").map(option => option.label)).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Checkbox"
    ])
    expect(matchingBlockTypeOptions("text")[0]?.label).toBe("Text")
    expect(shouldShowBlockMenuActionsForQuery(true, "l", 2)).toBe(false)
    expect(shouldShowBlockMenuActionsForQuery(true, "li", 2)).toBe(false)
    expect(shouldShowBlockMenuActionsForQuery(true, "list", 2)).toBe(false)
    expect(shouldShowBlockMenuActionsForQuery(true, "delete", 0)).toBe(true)
    expect(shouldShowBlockMenuActionsForQuery(false, "l", 2)).toBe(true)
  })

  it.each(["", "Item"])(
    "treats the exact same list type as a no-op without adding a block (%s)",
    (content) => {
      const bullet = schema.nodes.bullet_item!.create(
        { indent: 0 },
        content ? schema.text(content) : null
      )
      const doc = schema.nodes.doc!.create(null, bullet)
      let state = EditorState.create({
        doc,
        plugins: [multiBlockSelectionPlugin(schema)]
      })
      state = state.apply(state.tr.setMeta(multiBlockSelectionKey, {
        selectedBlocks: [0],
        anchorBlock: 0
      }))

      const bulletOption = BLOCK_TYPE_OPTIONS.find(
        option => option.type === "bullet_item"
      )!

      const transaction = createBlockTypeChangeTransaction(
        state,
        [0],
        bulletOption
      )
      expect(transaction).not.toBeNull()
      expect(transaction!.docChanged).toBe(false)
      state = state.apply(transaction!)

      expect(state.doc.childCount).toBe(1)
      expect(state.doc.firstChild).toBe(bullet)
      expect(state.doc.firstChild?.textContent).toBe(content)
      expect(selectedBlocks(state)).toEqual([])
      expect(state.selection.$from.parentOffset).toBe(content.length)
    }
  )

  it("converts structured block content into a valid text block", () => {
    const quote = schema.nodes.blockquote!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Quoted"))
    )
    const doc = schema.nodes.doc!.create(null, quote)
    const state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    const textOption = BLOCK_TYPE_OPTIONS.find(
      option => option.type === "paragraph"
    )!

    const transaction = createBlockTypeChangeTransaction(
      state,
      [0],
      textOption
    )
    expect(transaction).not.toBeNull()
    expect(() => transaction!.doc.check()).not.toThrow()
    expect(transaction!.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(transaction!.doc.firstChild?.textContent).toBe("Quoted")
  })
})

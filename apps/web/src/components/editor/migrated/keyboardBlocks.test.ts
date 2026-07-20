import { EditorState, NodeSelection, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { buildKeymap, removeEmptyParagraphBlock } from "./keymap"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import {
  createDuplicateBlocksTransaction,
  createMoveBlocksTransaction,
  duplicateBlocks,
  multiBlockSelectionKey,
  multiBlockSelectionPlugin,
  selectAllBlocksInStages
} from "./plugins/multiBlockSelection"
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
})

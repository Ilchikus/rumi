import { EditorState, NodeSelection, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { buildKeymap } from "./keymap"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import {
  createMoveBlocksTransaction,
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

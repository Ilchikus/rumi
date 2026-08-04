import { EditorState } from "prosemirror-state"
import type { Mark } from "prosemirror-model"
import { describe, expect, it } from "vitest"
import { serializeMarkdown } from "../markdown"
import { schema } from "../schema"
import {
  isInlineMarkActive,
  selectedBlockInlineRanges,
  toggleInlineMark
} from "./inlineFormatting"
import {
  multiBlockSelectionKey,
  multiBlockSelectionPlugin
} from "./multiBlockSelection"

function paragraph(text: string, marks: readonly Mark[] = []) {
  return schema.nodes.paragraph!.create(null, schema.text(text, marks))
}

function selectBlocks(state: EditorState, positions: number[]): EditorState {
  return state.apply(state.tr.setMeta(multiBlockSelectionKey, {
    selectedBlocks: positions,
    anchorBlock: positions[0] ?? null
  }))
}

describe("inline formatting across selected blocks", () => {
  it("applies one mark to every selected block without touching blocks between them", () => {
    const doc = schema.nodes.doc!.create(null, [
      paragraph("One"),
      paragraph("Two"),
      paragraph("Three")
    ])
    const secondPos = doc.child(0).nodeSize
    const thirdPos = secondPos + doc.child(1).nodeSize
    let state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    state = selectBlocks(state, [0, thirdPos])

    expect(selectedBlockInlineRanges(state)).toEqual([
      { from: 1, to: doc.child(0).nodeSize - 1 },
      { from: thirdPos + 1, to: thirdPos + doc.child(2).nodeSize - 1 }
    ])

    toggleInlineMark(schema.marks.bold!)(state, (transaction) => {
      state = state.apply(transaction)
    })

    expect(serializeMarkdown(state.doc)).toBe("**One**\n\nTwo\n\n**Three**\n")
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks).toEqual([0, thirdPos])
    expect(isInlineMarkActive(state, schema.marks.bold!)).toBe(true)
  })

  it("normalizes a mixed selection to marked, then removes the mark from all", () => {
    const bold = schema.marks.bold!.create()
    const doc = schema.nodes.doc!.create(null, [
      paragraph("Bold", [bold]),
      paragraph("Plain")
    ])
    const secondPos = doc.child(0).nodeSize
    let state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    state = selectBlocks(state, [0, secondPos])

    expect(isInlineMarkActive(state, schema.marks.bold!)).toBe(false)
    toggleInlineMark(schema.marks.bold!)(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(isInlineMarkActive(state, schema.marks.bold!)).toBe(true)

    toggleInlineMark(schema.marks.bold!)(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(state.doc.textBetween(0, state.doc.content.size, " ")).toBe("Bold Plain")
    expect(state.doc.rangeHasMark(0, state.doc.content.size, schema.marks.bold!)).toBe(false)
  })
})

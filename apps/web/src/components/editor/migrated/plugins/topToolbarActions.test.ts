import { EditorState, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { schema } from "../schema"
import {
  allowedMediaAccept,
  createAdjacentParagraphTransaction,
  createDeleteToolbarBlocksTransaction,
  createUploadedMediaTransaction
} from "./topToolbarActions"
import {
  multiBlockSelectionKey,
  multiBlockSelectionPlugin
} from "./multiBlockSelection"

describe("top toolbar block actions", () => {
  it("adds before the first or after the last explicitly selected block", () => {
    const first = schema.nodes.paragraph!.create(null, schema.text("One"))
    const second = schema.nodes.paragraph!.create(null, schema.text("Two"))
    const secondPos = first.nodeSize
    let state = EditorState.create({
      doc: schema.nodes.doc!.create(null, [first, second]),
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    state = state.apply(state.tr.setMeta(multiBlockSelectionKey, {
      selectedBlocks: [0, secondPos],
      anchorBlock: 0
    }))

    const before = createAdjacentParagraphTransaction(state, "before")
    const after = createAdjacentParagraphTransaction(state, "after")

    expect(before?.doc.child(0).textContent).toBe("")
    expect(before?.doc.child(1).textContent).toBe("One")
    expect(after?.doc.child(1).textContent).toBe("Two")
    expect(after?.doc.child(2).textContent).toBe("")
  })

  it("filters the picker to configured extensions and inserts the matching media node", () => {
    expect(allowedMediaAccept(["PNG", ".pdf", ".PNG", "bad/type"]))
      .toBe(".png,.pdf")

    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Anchor"))
    )
    const state = EditorState.create({ doc })
    const image = createUploadedMediaTransaction(state, ".assets/photo.webp")
    const file = createUploadedMediaTransaction(state, ".assets/demo.webm")

    expect(image?.doc.child(1).type).toBe(schema.nodes.image)
    expect(image?.doc.child(1).attrs.src).toBe(".assets/photo.webp")
    expect(file?.doc.child(1).type).toBe(schema.nodes.file_embed)
    expect(file?.doc.child(1).attrs.src).toBe(".assets/demo.webm")
  })

  it("deletes the cursor block or every explicitly selected block", () => {
    const first = schema.nodes.paragraph!.create(null, schema.text("One"))
    const second = schema.nodes.paragraph!.create(null, schema.text("Two"))
    const doc = schema.nodes.doc!.create(null, [first, second])
    const secondPos = first.nodeSize
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, secondPos + 1),
      plugins: [multiBlockSelectionPlugin(schema)]
    })

    const cursorDeletion = createDeleteToolbarBlocksTransaction(state)
    expect(cursorDeletion?.doc.childCount).toBe(1)
    expect(cursorDeletion?.doc.child(0).textContent).toBe("One")

    state = state.apply(state.tr.setMeta(multiBlockSelectionKey, {
      selectedBlocks: [0, secondPos],
      anchorBlock: 0
    }))
    const selectionDeletion = createDeleteToolbarBlocksTransaction(state)
    expect(selectionDeletion?.doc.childCount).toBe(1)
    expect(selectionDeletion?.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(selectionDeletion?.doc.firstChild?.textContent).toBe("")
  })
})

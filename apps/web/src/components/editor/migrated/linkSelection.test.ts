import { EditorState, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { schema } from "./schema"
import { linkRangeAtSelection } from "./linkSelection"

describe("linkRangeAtSelection", () => {
  it("expands a caret at the start or inside a link", () => {
    const link = schema.marks.link!.create({ href: "Notes.md" })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        schema.text("Before "),
        schema.text("linked text", [link]),
        schema.text(" after")
      ])
    )

    for (const position of [8, 11, 18]) {
      const state = EditorState.create({
        doc,
        selection: TextSelection.create(doc, position)
      })
      expect(linkRangeAtSelection(state)).toEqual({
        from: 8,
        to: 19,
        href: "Notes.md"
      })
    }
  })

  it("does not treat the first plain-text position after a link as linked", () => {
    const link = schema.marks.link!.create({ href: "Notes.md" })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        schema.text("linked", [link]),
        schema.text(" plain")
      ])
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 7)
    })

    expect(linkRangeAtSelection(state)).toBeNull()
  })

  it("does not treat a caret in plain text as a link", () => {
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Plain text"))
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3)
    })

    expect(linkRangeAtSelection(state)).toBeNull()
  })
})

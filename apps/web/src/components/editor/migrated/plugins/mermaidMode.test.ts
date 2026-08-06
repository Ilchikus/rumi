import { EditorState, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { setMermaidEditSelection } from "../structuralCaretSelection"
import { schema } from "../schema"
import { mermaidModePlugin } from "./mermaidMode"

function mermaidDocument(mode: "view" | "edit" = "edit") {
  const mermaid = schema.nodes.mermaid!.create(
    { mode },
    schema.text("flowchart TD\n  A --> B")
  )
  const paragraph = schema.nodes.paragraph!.create(null, schema.text("After"))
  return {
    mermaid,
    paragraph,
    doc: schema.nodes.doc!.create(null, [mermaid, paragraph])
  }
}

describe("Mermaid mode follows its text caret", () => {
  it("returns an edited Mermaid block to view when its caret leaves", () => {
    const { mermaid, paragraph, doc } = mermaidDocument()
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [mermaidModePlugin()]
    })

    const next = state.applyTransaction(
      state.tr.setSelection(
        TextSelection.create(state.doc, mermaid.nodeSize + 1)
      )
    ).state

    expect(next.doc.firstChild?.attrs.mode).toBe("view")
    expect(next.selection.$from.parent).toBe(paragraph)
  })

  it("does not change mode while the caret moves within Mermaid source", () => {
    const { doc } = mermaidDocument()
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [mermaidModePlugin()]
    })

    const next = state.applyTransaction(
      state.tr.setSelection(TextSelection.create(state.doc, 8))
    ).state

    expect(next.doc.firstChild?.attrs.mode).toBe("edit")
  })

  it("keeps edit mode while Shift-Arrow extends a text selection", () => {
    const { mermaid, doc } = mermaidDocument()
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, mermaid.content.size),
      plugins: [mermaidModePlugin()]
    })

    const next = state.applyTransaction(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          mermaid.content.size,
          mermaid.nodeSize + 2
        )
      )
    ).state

    expect(next.selection.empty).toBe(false)
    expect(next.doc.firstChild?.attrs.mode).toBe("edit")
  })

  it("allows Mermaid arrow entry to reveal source and place its caret", () => {
    const { mermaid, doc } = mermaidDocument("view")
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, mermaid.nodeSize + 1),
      plugins: [mermaidModePlugin()]
    })
    const transaction = state.tr

    expect(setMermaidEditSelection(transaction, 0, "after")).toBe(true)
    const next = state.applyTransaction(transaction).state

    expect(next.doc.firstChild?.attrs.mode).toBe("edit")
    expect(next.selection.$from.parent.type.name).toBe("mermaid")
    expect(next.selection.$from.parentOffset).toBe(mermaid.content.size)
  })

  it("does not modify non-Mermaid blocks when their caret moves", () => {
    const before = schema.nodes.paragraph!.create(null, schema.text("Before"))
    const code = schema.nodes.code_block!.create(
      { language: "typescript" },
      schema.text("const value = 1")
    )
    const after = schema.nodes.paragraph!.create(null, schema.text("After"))
    const doc = schema.nodes.doc!.create(null, [before, code, after])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [mermaidModePlugin()]
    })

    const next = state.applyTransaction(
      state.tr.setSelection(
        TextSelection.create(state.doc, before.nodeSize + code.nodeSize + 1)
      )
    ).state

    expect(next.doc.eq(doc)).toBe(true)
    expect(next.doc.child(1).type).toBe(schema.nodes.code_block)
  })
})

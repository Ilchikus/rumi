import { EditorState, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { createDocumentEndClickTransaction } from "./documentEnd"
import { parseMarkdown } from "./markdown"
import {
  collapsibleHeadingsKey,
  collapsibleHeadingsPlugin
} from "./plugins/collapsibleHeadings"
import { schema } from "./schema"

function editorState(markdown: string): EditorState {
  return EditorState.create({
    doc: parseMarkdown(markdown, schema),
    plugins: [collapsibleHeadingsPlugin()]
  })
}

describe("document-end click", () => {
  it("exits a final collapsed code-only section", () => {
    let state = editorState(
      "# Project\n\n```ts\nconst answer = 42\n```\n"
    )
    state = state.apply(
      state.tr.setMeta(collapsibleHeadingsKey, {
        collapsed: new Set([0])
      })
    )

    const transaction = createDocumentEndClickTransaction(state)
    expect(transaction).not.toBeNull()
    state = state.apply(transaction!)

    expect(Array.from(
      { length: state.doc.childCount },
      (_, index) => state.doc.child(index).type.name
    )).toEqual([
      "heading",
      "code_block",
      "horizontal_rule",
      "paragraph"
    ])
    expect(state.selection.$from.parent.type).toBe(schema.nodes.paragraph)
  })

  it("appends a normal paragraph after an expanded heading", () => {
    let state = editorState("# Project\n")

    const transaction = createDocumentEndClickTransaction(state)
    expect(transaction).not.toBeNull()
    state = state.apply(transaction!)

    expect(state.doc.childCount).toBe(2)
    expect(state.doc.lastChild?.type).toBe(schema.nodes.paragraph)
    expect(state.doc.child(0).type).toBe(schema.nodes.heading)
    expect(state.selection.$from.parent).toBe(state.doc.lastChild)
  })

  it("focuses an existing final blank paragraph without changing the document", () => {
    const doc = schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text("Body")),
      schema.nodes.paragraph!.create()
    ])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1)
    })

    const transaction = createDocumentEndClickTransaction(state)
    expect(transaction).not.toBeNull()
    expect(transaction!.docChanged).toBe(false)
    state = state.apply(transaction!)

    expect(state.selection.$from.parent).toBe(state.doc.lastChild)
  })
})

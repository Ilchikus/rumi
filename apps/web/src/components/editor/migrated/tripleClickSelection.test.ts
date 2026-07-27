import { EditorState, TextSelection } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { describe, expect, it, vi } from "vitest"
import { multiBlockSelectionPlugin, textRowSelectionAtPosition } from "./plugins/multiBlockSelection"
import { schema } from "./schema"

function hardBreakDocument() {
  const paragraph = schema.nodes.paragraph!.create(null, [
    schema.text("Alpha"),
    schema.nodes.hard_break!.create(),
    schema.text("Beta"),
    schema.nodes.hard_break!.create(),
    schema.text("Gamma")
  ])
  return schema.nodes.doc!.create(null, paragraph)
}

describe("live editor triple-click selection", () => {
  it.each([
    { pos: 3, from: 1, to: 6, text: "Alpha" },
    { pos: 8, from: 7, to: 11, text: "Beta" },
    { pos: 14, from: 12, to: 17, text: "Gamma" }
  ])("selects only the explicit row containing position $pos", ({ pos, from, to, text }) => {
    const state = EditorState.create({ doc: hardBreakDocument() })
    const selection = textRowSelectionAtPosition(state, pos)

    expect(selection).toBeInstanceOf(TextSelection)
    expect(selection?.from).toBe(from)
    expect(selection?.to).toBe(to)
    expect(state.doc.textBetween(selection!.from, selection!.to)).toBe(text)
  })

  it("also treats literal newlines in code blocks as row boundaries", () => {
    const code = schema.nodes.code_block!.create(
      { language: null },
      schema.text("one\ntwo\nthree")
    )
    const state = EditorState.create({
      doc: schema.nodes.doc!.create(null, code)
    })

    const selection = textRowSelectionAtPosition(state, 6)

    expect(selection?.from).toBe(5)
    expect(selection?.to).toBe(8)
    expect(state.doc.textBetween(selection!.from, selection!.to)).toBe("two")
  })

  it("overrides ProseMirror's triple-click default without changing single-row blocks", () => {
    const plugin = multiBlockSelectionPlugin(schema)
    const handler = plugin.props.handleTripleClick
    let state = EditorState.create({ doc: hardBreakDocument() })
    const focus = vi.fn()
    const view = {
      get state() {
        return state
      },
      focused: false,
      focus,
      dispatch(transaction: ReturnType<typeof state.tr.setSelection>) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView

    expect(handler?.call(
      plugin,
      view,
      8,
      { button: 0 } as MouseEvent
    )).toBe(true)
    expect(focus).toHaveBeenCalledOnce()
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe("Beta")

    const oneRowState = EditorState.create({
      doc: schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, schema.text("Only row")))
    })
    expect(textRowSelectionAtPosition(oneRowState, 3)).toBeNull()
  })
})

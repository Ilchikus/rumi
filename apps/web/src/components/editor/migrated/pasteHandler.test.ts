import { Slice } from "prosemirror-model"
import { EditorState, TextSelection, type Transaction } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { describe, expect, it } from "vitest"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { schema } from "./schema"
import {
  createCodeTextPasteTransaction,
  createUrlPasteTransaction,
  pasteHandlerPlugin
} from "./plugins/pasteHandler"

function stateWithSelection(markdown: string, from: number, to = from): EditorState {
  const doc = parseMarkdown(markdown, schema)
  const state = EditorState.create({ doc })
  return state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)))
}

describe("live editor URL paste", () => {
  it("pastes a URL into an empty paragraph as an inline link", () => {
    const state = stateWithSelection("", 1)
    const transaction = createUrlPasteTransaction(state, "https://rumi.md", schema)

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.firstChild?.type.name).toBe("paragraph")
    expect(serializeMarkdown(transaction!.doc)).toBe("[https://rumi.md](https://rumi.md)\n")
  })

  it("uses selected text as the pasted link label", () => {
    const state = stateWithSelection("Rumi docs", 1, 10)
    const transaction = createUrlPasteTransaction(state, "https://rumi.md", schema)

    expect(transaction).not.toBeNull()
    expect(serializeMarkdown(transaction!.doc)).toBe("[Rumi docs](https://rumi.md)\n")
  })

  it("leaves URL text untouched inside code blocks", () => {
    const state = stateWithSelection("```ts\nconst url = \"\"\n```", 2)

    expect(createUrlPasteTransaction(state, "https://rumi.md", schema)).toBeNull()
  })
})

describe("live editor code paste", () => {
  it("keeps a multiline paste and the surrounding source in one code block", () => {
    const code = schema.nodes.code_block!.create(
      { language: "ts" },
      schema.text("alphaBETAgamma")
    )
    const doc = schema.nodes.doc!.create(null, code)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })

    const transaction = createCodeTextPasteTransaction(
      state,
      "beta\ndelta",
      schema
    )

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.childCount).toBe(1)
    expect(transaction!.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(transaction!.doc.firstChild?.attrs.language).toBe("ts")
    expect(transaction!.doc.firstChild?.textContent).toBe("alphabeta\ndeltagamma")
    expect(serializeMarkdown(transaction!.doc)).toBe(
      "```ts\nalphabeta\ndeltagamma\n```\n"
    )
  })

  it("preserves whitespace, Markdown punctuation, and URLs literally", () => {
    const code = schema.nodes.code_block!.create({ language: null })
    const doc = schema.nodes.doc!.create(null, code)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1)
    })
    const pasted = "  # literal\nhttps://rumi.md\n\n\tend  "

    const transaction = createCodeTextPasteTransaction(state, pasted, schema)

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.firstChild?.textContent).toBe(pasted)
    expect(transaction!.doc.firstChild?.type).toBe(schema.nodes.code_block)
  })

  it("does not claim text selections outside code", () => {
    const state = stateWithSelection("Paragraph", 1)
    expect(createCodeTextPasteTransaction(state, "text", schema)).toBeNull()
  })

  it("uses the parsed slice when an HTML clipboard has no plain-text flavor", () => {
    const code = schema.nodes.code_block!.create(
      { language: "ts" },
      schema.text("alphaBETAgamma")
    )
    const doc = schema.nodes.doc!.create(null, code)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })
    const plugin = pasteHandlerPlugin(schema)
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView
    const pastedContent = schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text("beta")),
      schema.nodes.paragraph!.create(null, schema.text("delta"))
    ]).content
    let prevented = false
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) {
          return type === "text/html"
            ? "<p>beta</p><p>delta</p>"
            : ""
        }
      },
      preventDefault() {
        prevented = true
      }
    } as unknown as ClipboardEvent

    const handled = plugin.props.handlePaste?.call(
      plugin,
      view,
      event,
      new Slice(pastedContent, 0, 0)
    )

    expect(handled).toBe(true)
    expect(prevented).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(state.doc.firstChild?.attrs.language).toBe("ts")
    expect(state.doc.firstChild?.textContent).toBe("alphabeta\ndeltagamma")
  })

  it("does not delete selected code for an empty textual clipboard", () => {
    const code = schema.nodes.code_block!.create(
      { language: null },
      schema.text("alphaBETAgamma")
    )
    const doc = schema.nodes.doc!.create(null, code)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })

    expect(createCodeTextPasteTransaction(state, "", schema)).toBeNull()
    expect(state.doc.firstChild?.textContent).toBe("alphaBETAgamma")
  })
})

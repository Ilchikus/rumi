import { EditorState, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { schema } from "./schema"
import { createUrlPasteTransaction } from "./plugins/pasteHandler"

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

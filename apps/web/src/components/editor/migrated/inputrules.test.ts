import { EditorState, type Transaction } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { describe, expect, it } from "vitest"
import { buildInputRules } from "./inputrules"
import { serializeMarkdown } from "./markdown"
import { schema } from "./schema"

function typeText(text: string): EditorState {
  const inputRulesPlugin = buildInputRules(schema)
  let state = EditorState.create({
    doc: schema.nodes.doc!.create(null, schema.nodes.paragraph!.create()),
    plugins: [inputRulesPlugin]
  })
  const view = {
    get state() {
      return state
    },
    composing: false,
    dispatch(transaction: Transaction) {
      state = state.apply(transaction)
    }
  } as unknown as EditorView
  const handleTextInput = inputRulesPlugin.props.handleTextInput

  if (!handleTextInput) throw new Error("Input rules plugin has no text-input handler")

  for (const character of text) {
    const { from, to } = state.selection
    const handled = handleTextInput.call(
      inputRulesPlugin,
      view,
      from,
      to,
      character,
      () => state.tr.insertText(character, from, to)
    )
    if (!handled) view.dispatch(state.tr.insertText(character, from, to))
  }

  return state
}

describe("live editor task input rules", () => {
  it.each([
    ["bare unchecked", "[] ", false, "- []\n"],
    ["spaced-dash unchecked", "- [] ", false, "- []\n"],
    ["compact-dash unchecked", "-[] ", false, "- []\n"],
    ["bare checked", "[x] ", true, "- [x]\n"],
    ["spaced-dash checked", "- [x] ", true, "- [x]\n"],
    ["compact-dash checked", "-[x] ", true, "- [x]\n"]
  ])("turns the %s shortcut into a task item after Space", (_name, shortcut, checked, markdown) => {
    const state = typeText(shortcut)

    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.type.name).toBe("task_item")
    expect(state.doc.firstChild?.attrs.checked).toBe(checked)
    expect(state.doc.firstChild?.textContent).toBe("")
    expect(serializeMarkdown(state.doc)).toBe(markdown)
  })

  it.each([
    ["[]", "paragraph", "[]"],
    ["- []", "bullet_item", "[]"],
    ["-[]", "paragraph", "-[]"],
    ["[x]", "paragraph", "[x]"],
    ["- [x]", "bullet_item", "[x]"],
    ["-[x]", "paragraph", "-[x]"]
  ])("keeps %s literal until the trailing Space", (text, blockType, content) => {
    const state = typeText(text)

    expect(state.doc.firstChild?.type.name).toBe(blockType)
    expect(state.doc.firstChild?.textContent).toBe(content)
  })

  it("also accepts the spaced GFM unchecked marker", () => {
    const state = typeText("- [ ] ")

    expect(state.doc.firstChild?.type.name).toBe("task_item")
    expect(state.doc.firstChild?.attrs.checked).toBe(false)
    expect(serializeMarkdown(state.doc)).toBe("- []\n")
  })
})

describe("live editor strikethrough input rules", () => {
  it("uses GFM double tildes and keeps double hyphens literal", () => {
    const strikethrough = typeText("~~struck through~~")
    const plainHyphens = typeText("--plain hyphens--")

    expect(strikethrough.doc.firstChild?.firstChild?.marks
      .map((mark) => mark.type.name)).toEqual(["strikethrough"])
    expect(serializeMarkdown(strikethrough.doc)).toBe("~~struck through~~\n")
    expect(plainHyphens.doc.firstChild?.firstChild?.marks).toEqual([])
    expect(serializeMarkdown(plainHyphens.doc)).toBe("--plain hyphens--\n")
  })
})

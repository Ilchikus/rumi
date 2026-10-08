// @vitest-environment jsdom
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { describe, expect, it } from "vitest"
import { parseMarkdown, serializeMarkdown } from "../markdown"
import { schema } from "../schema"
import { numberedListPlugin } from "./numberedList"

function shownNumbers(markdown: string): string[] {
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ doc: parseMarkdown(markdown, schema), plugins: [numberedListPlugin()] })
  })
  const shown = Array.from(view.dom.querySelectorAll(".numbered-item"), (item) =>
    `${item.getAttribute("data-indent")}:${/counter-set: numbered-item (\d+)/u.exec(item.getAttribute("style") ?? "")?.[1]} ${item.textContent}`
  )
  view.destroy()
  return shown
}

describe("numbered list display", () => {
  it("shows the numbers the file is saved with", () => {
    const markdown = [
      "1. first",
      "",
      "",
      "2. second",
      "    1. nested",
      "    2. nested",
      "3. third",
      "    1. restarts",
      "",
      "Text",
      "",
      "1. new list",
      "",
      "> 1. quoted",
      "> 2. quoted",
      ""
    ].join("\n")

    expect(serializeMarkdown(parseMarkdown(markdown, schema))).toBe(markdown)
    expect(shownNumbers(markdown)).toEqual([
      "0:1 first",
      "0:2 second",
      "1:1 nested",
      "1:2 nested",
      "0:3 third",
      "1:1 restarts",
      "0:1 new list",
      "0:1 quoted",
      "0:2 quoted"
    ])
  })
})

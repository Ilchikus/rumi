// @vitest-environment jsdom
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { afterEach, describe, expect, it } from "vitest"
import { parseMarkdown } from "./markdown"
import { schema } from "./schema"
import { collapsibleHeadingsKey, collapsibleHeadingsPlugin } from "./plugins/collapsibleHeadings"
import {
  collapsedHeadingIdentities,
  collapsedHeadingPositions,
  collapsedHeadingsStorageKey
} from "./headingCollapseMemory"

const STORAGE_KEY = collapsedHeadingsStorageKey("/docs", "Plan.md")
const MARKDOWN = "# Plan\n\n## Notes\n\nFirst\n\n## Notes\n\nSecond\n\n## Done\n"

afterEach(() => window.localStorage.clear())

function headingPositions(doc = parseMarkdown(MARKDOWN, schema)): number[] {
  const positions: number[] = []
  doc.forEach((node, offset) => {
    if (node.type.name === "heading") positions.push(offset)
  })
  return positions
}

function openEditor(markdown = MARKDOWN): EditorView {
  return new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: parseMarkdown(markdown, schema),
      plugins: [collapsibleHeadingsPlugin(STORAGE_KEY)]
    })
  })
}

function collapse(view: EditorView, positions: number[]): void {
  view.dispatch(view.state.tr.setMeta(collapsibleHeadingsKey, { collapsed: new Set(positions) }))
}

function collapsedText(view: EditorView): string[] {
  return [...collapsibleHeadingsKey.getState(view.state)!.collapsed]
    .sort((a, b) => a - b)
    .map((pos) => view.state.doc.nodeAt(pos)!.textContent)
}

describe("remembered collapsed headings", () => {
  it("identifies duplicate headings by occurrence", () => {
    const doc = parseMarkdown(MARKDOWN, schema)
    const [, firstNotes, secondNotes] = headingPositions(doc)
    const identities = collapsedHeadingIdentities(doc, new Set([secondNotes!]))

    expect(identities).toEqual(["1:2:Notes"])
    expect([...collapsedHeadingPositions(doc, identities)]).toEqual([secondNotes])
    expect(collapsedHeadingPositions(doc, identities).has(firstNotes!)).toBe(false)
  })

  it("restores collapsed headings when the page opens again", () => {
    const [plan, , secondNotes] = headingPositions()
    const first = openEditor()
    collapse(first, [plan!, secondNotes!])
    first.destroy()

    const reopened = openEditor()
    expect(collapsedText(reopened)).toEqual(["Plan", "Notes"])
    expect([...collapsibleHeadingsKey.getState(reopened.state)!.collapsed].sort((a, b) => a - b))
      .toEqual([plan, secondNotes])

    collapse(reopened, [])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    reopened.destroy()
  })

  it("forgets a heading whose text changed outside the editor", () => {
    const [, , , done] = headingPositions()
    const first = openEditor()
    collapse(first, [done!])
    first.destroy()

    const reopened = openEditor(MARKDOWN.replace("## Done", "## Finished"))
    expect(collapsedText(reopened)).toEqual([])
    reopened.destroy()
  })

  it("follows a heading edited while collapsed", () => {
    const [plan] = headingPositions()
    const first = openEditor()
    collapse(first, [plan!])
    first.dispatch(first.state.tr.insertText(" v2", plan! + 1 + "Plan".length))
    first.destroy()

    expect(collapsedText(openEditor(MARKDOWN.replace("# Plan", "# Plan v2")))).toEqual(["Plan v2"])
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { EditorState, TextSelection, type Transaction } from "prosemirror-state"
import { history, undo } from "prosemirror-history"
import { EditorView } from "prosemirror-view"
import { schema } from "./schema"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { buildKeymap, exitCodeOnEmptyLine, formatLocalDate, insertCurrentDate } from "./keymap"
import { textRowSelectionAtPosition } from "./plugins/multiBlockSelection"
import { blockDragScrollVelocity } from "./plugins/blockDragHandle"
import { createBlockTypeChangeTransaction } from "./plugins/blockTypeConversion"
import { BLOCK_TYPE_OPTIONS } from "./plugins/blockTypePresentation"
import { documentHeadings, documentOutlinePlugin, navigateToHeading } from "./plugins/documentOutline"
import { collapsibleHeadingsKey, collapsibleHeadingsPlugin } from "./plugins/collapsibleHeadings"

const views: EditorView[] = []
afterEach(() => { views.forEach((view) => view.destroy()); views.length = 0; document.body.replaceChildren(); vi.useRealTimers() })

it("inserts local date/time, replaces selection, suppresses default, and undoes", () => {
  const now = new Date(2026, 10, 3, 9, 5)
  expect(formatLocalDate(now)).toBe("2026-11-03")
  expect(formatLocalDate(now, true)).toBe("2026-11-03 09:05")
  vi.useFakeTimers(); vi.setSystemTime(now)
  let state = EditorState.create({ doc: parseMarkdown("replace", schema), plugins: [history(), buildKeymap(schema)] })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 8)))
  const dispatch = (tr: Transaction) => { state = state.apply(tr) }
  expect(insertCurrentDate(true)(state, dispatch)).toBe(true)
  expect(state.doc.textContent).toBe("2026-11-03 09:05")
  expect(undo(state, dispatch)).toBe(true)
  expect(state.doc.textContent).toBe("replace")
})

it.each(["code_block", "mermaid"])("exits %s on its trailing empty line in one undo step", (type) => {
  const node = schema.nodes[type]!.create(null, schema.text("one\n"))
  let state = EditorState.create({ doc: schema.nodes.doc!.create(null, node), plugins: [history()] })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, node.content.size + 1)))
  const dispatch = (tr: Transaction) => { state = state.apply(tr) }
  expect(exitCodeOnEmptyLine(state, dispatch)).toBe(true)
  expect(state.doc.firstChild?.textContent).toBe("one")
  expect(state.doc.lastChild?.type.name).toBe("paragraph")
  expect(state.selection.$from.parent.type.name).toBe("paragraph")
  expect(undo(state, dispatch)).toBe(true)
  expect(state.doc.childCount).toBe(1)
  expect(state.doc.textContent).toBe("one\n")
})

it("retains Enter as code input when the last line is nonempty", () => {
  const doc = parseMarkdown("```html\n<div>hi</div>\n```", schema)
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, doc.firstChild!.content.size + 1) })
  expect(exitCodeOnEmptyLine(state)).toBe(false)
})

it("selects exactly one Mermaid source line on triple click, including single-line blocks", () => {
  for (const text of ["flowchart TD", "flowchart TD\nA --> B\nB --> C"]) {
    const doc = schema.nodes.doc!.create(null, schema.nodes.mermaid!.create(null, schema.text(text)))
    const state = EditorState.create({ doc })
    const selection = textRowSelectionAtPosition(state, 4)!
    expect(doc.textBetween(selection.from, selection.to)).toBe("flowchart TD")
  }
})

it("uses the requested edge zones at a 720 px/s baseline", () => {
  expect(blockDragScrollVelocity(895, 0, 1000)).toBe(0)
  expect(blockDragScrollVelocity(910, 0, 1000)).toBe(360)
  expect(blockDragScrollVelocity(960, 0, 1000)).toBe(720)
  expect(blockDragScrollVelocity(40, 0, 1000)).toBe(-720)
  expect(blockDragScrollVelocity(-1, 0, 1000)).toBe(0)
})

it("creates two editable columns through block conversion while retaining inline formatting", () => {
  const doc = parseMarkdown("**Keep this**", schema)
  const state = EditorState.create({ doc })
  const tr = createBlockTypeChangeTransaction(state, [0], BLOCK_TYPE_OPTIONS.find((option) => option.type === "columns")!)!
  expect(tr.doc.firstChild?.type.name).toBe("columns")
  expect(tr.doc.firstChild?.firstChild?.firstChild?.firstChild?.marks[0]?.type.name).toBe("bold")
  tr.doc.check()
  expect(parseMarkdown(serializeMarkdown(tr.doc), schema).toJSON()).toEqual(tr.doc.toJSON())
})

describe("document outline", () => {
  it("gives duplicate, Unicode and colliding heading names unique anchors", () => {
    const doc = parseMarkdown("# Hello\n\n## Hello\n\n## Hello-1\n\n## Привет мир\n\n### !!!", schema)
    const ids = documentHeadings(doc).map((heading) => heading.id)
    expect(ids).toEqual(["hello", "hello-1", "hello-1-1", "привет-мир", "section"])
  })
  it("updates the outline live and reveals collapsed ancestors without changing Markdown", () => {
    const host = document.createElement("div"); host.className = "prosemirror-editor-wrapper"; document.body.append(host)
    const view = new EditorView(host, { state: EditorState.create({ doc: parseMarkdown("# Parent\n\n## Child\n\nBody", schema), plugins: [documentOutlinePlugin(), collapsibleHeadingsPlugin()] }) })
    views.push(view)
    const before = serializeMarkdown(view.state.doc)
    view.dispatch(view.state.tr.setMeta(collapsibleHeadingsKey, { collapsed: new Set([0]) }))
    expect(navigateToHeading(view, "#child")).toBe(true)
    expect(collapsibleHeadingsKey.getState(view.state)?.collapsed.size).toBe(0)
    expect(serializeMarkdown(view.state.doc)).toBe(before)
    expect(host.querySelector('nav[aria-label="Table of contents"]')?.textContent).toContain("Child")
    view.dispatch(view.state.tr.insertText("Updated ", documentHeadings(view.state.doc)[1]!.pos + 1))
    expect(host.querySelector("nav")?.textContent).toContain("Updated Child")
    expect(navigateToHeading(view, "#missing")).toBe(false)
    expect(navigateToHeading(view, "#%oops")).toBe(false)
  })
})

it.each([false, true])("consumes the date shortcut browser action (with time: %s)", (withTime) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 3, 9, 5))
  const host = document.createElement("div"); document.body.append(host)
  const view = new EditorView(host, { state: EditorState.create({ doc: parseMarkdown("", schema), plugins: [buildKeymap(schema)] }) })
  views.push(view)
  const event = new KeyboardEvent("keydown", { key: ";", code: "Semicolon", ctrlKey: true, shiftKey: withTime, bubbles: true, cancelable: true })
  view.dom.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(view.state.doc.textContent).toBe(withTime ? "2026-11-03 09:05" : "2026-11-03")
})

it("keeps collapsed heading sections inside their own column", () => {
  const host = document.createElement("div"); document.body.append(host)
  const doc = parseMarkdown("```columns\n# Left\n\nleft body\n\n|||\n\n# Right\n\nright body\n```", schema)
  const view = new EditorView(host, { state: EditorState.create({ doc, plugins: [collapsibleHeadingsPlugin()] }) })
  views.push(view)
  const [left, right] = documentHeadings(doc)
  view.dispatch(view.state.tr.setMeta(collapsibleHeadingsKey, { collapsed: new Set([left!.pos]) }))
  expect(navigateToHeading(view, right!.id)).toBe(true)
  expect(collapsibleHeadingsKey.getState(view.state)?.collapsed.has(left!.pos)).toBe(true)
})

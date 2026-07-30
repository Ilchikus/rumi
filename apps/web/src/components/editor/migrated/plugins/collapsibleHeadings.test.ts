import {
  EditorState,
  TextSelection,
  type Transaction
} from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { describe, expect, it } from "vitest"
import { parseMarkdown } from "../markdown"
import { schema } from "../schema"
import {
  collapsibleHeadingsKey,
  collapsibleHeadingsPlugin,
  createCollapsedHeadingExitTransaction,
  findSectionEnd
} from "./collapsibleHeadings"

function blockPositions(state: EditorState): number[] {
  const positions: number[] = []
  state.doc.forEach((_node, pos) => positions.push(pos))
  return positions
}

function collapsedHeadingState(
  markdown: string,
  plugin = collapsibleHeadingsPlugin()
): EditorState {
  const doc = parseMarkdown(markdown, schema)
  const heading = doc.firstChild!
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1 + heading.content.size),
    plugins: [plugin]
  })
  state = state.apply(
    state.tr.setMeta(collapsibleHeadingsKey, {
      collapsed: new Set([0])
    })
  )
  return state
}

describe("toggleable heading boundaries", () => {
  it("treats a horizontal rule as the end of every heading level", () => {
    const doc = parseMarkdown(
      "# Parent\n\nBody\n\n## Child\n\nChild body\n\n---\n\nAfter\n\n# Next\n",
      schema
    )
    const positions: number[] = []
    doc.forEach((_node, pos) => positions.push(pos))
    const rulePos = positions.find(
      (pos) => doc.nodeAt(pos)?.type === schema.nodes.horizontal_rule
    )!

    expect(findSectionEnd(doc, 0, 1)).toBe(rulePos)
    expect(findSectionEnd(doc, positions[2]!, 2)).toBe(rulePos)
  })

  it("inserts the escape divider after hidden descendants and keeps the heading collapsed", () => {
    let state = collapsedHeadingState(
      "# Project\n\nSecret\n\n## Child\n\nChild body\n\n# Next\n"
    )

    const transaction = createCollapsedHeadingExitTransaction(state)
    expect(transaction).not.toBeNull()
    state = state.apply(transaction!)

    expect(Array.from(
      { length: state.doc.childCount },
      (_, index) => state.doc.child(index).type.name
    )).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
      "horizontal_rule",
      "paragraph",
      "heading"
    ])
    expect(state.selection.$from.parent.type).toBe(schema.nodes.paragraph)
    expect(state.selection.$from.parent.content.size).toBe(0)
    expect(collapsibleHeadingsKey.getState(state)?.collapsed).toEqual(new Set([0]))

    const positions = blockPositions(state)
    expect(findSectionEnd(state.doc, 0, 1)).toBe(positions[4])
  })

  it("reuses an existing divider and inserts only the missing blank paragraph", () => {
    let state = collapsedHeadingState(
      "# Project\n\nSecret\n\n---\n\n# Next\n"
    )

    const transaction = createCollapsedHeadingExitTransaction(state)
    expect(transaction).not.toBeNull()
    state = state.apply(transaction!)

    expect(Array.from(
      { length: state.doc.childCount },
      (_, index) => state.doc.child(index).type.name
    )).toEqual([
      "heading",
      "paragraph",
      "horizontal_rule",
      "paragraph",
      "heading"
    ])
    expect(Array.from(
      { length: state.doc.childCount },
      (_, index) => state.doc.child(index).type
    ).filter((type) => type === schema.nodes.horizontal_rule)).toHaveLength(1)
    expect(state.selection.$from.parent.type).toBe(schema.nodes.paragraph)
  })

  it("focuses an existing blank paragraph below the divider without adding blocks", () => {
    const heading = schema.nodes.heading!.create(
      { level: 1 },
      schema.text("Project")
    )
    const secret = schema.nodes.paragraph!.create(null, schema.text("Secret"))
    const rule = schema.nodes.horizontal_rule!.create()
    const blank = schema.nodes.paragraph!.create()
    const next = schema.nodes.heading!.create({ level: 1 }, schema.text("Next"))
    const doc = schema.nodes.doc!.create(null, [heading, secret, rule, blank, next])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1 + heading.content.size),
      plugins: [collapsibleHeadingsPlugin()]
    })
    state = state.apply(
      state.tr.setMeta(collapsibleHeadingsKey, {
        collapsed: new Set([0])
      })
    )

    const transaction = createCollapsedHeadingExitTransaction(state)
    expect(transaction).not.toBeNull()
    expect(transaction!.docChanged).toBe(false)
    state = state.apply(transaction!)

    expect(state.doc.childCount).toBe(5)
    expect(state.selection.$from.parent).toBe(state.doc.child(3))
  })

  it("runs only at the end of a collapsed heading", () => {
    const collapsed = collapsedHeadingState("# Project\n\nSecret\n")
    const middle = collapsed.apply(
      collapsed.tr.setSelection(TextSelection.create(collapsed.doc, 2))
    )
    expect(createCollapsedHeadingExitTransaction(middle)).toBeNull()

    const expandedDoc = parseMarkdown("# Project\n\nSecret\n", schema)
    const expanded = EditorState.create({
      doc: expandedDoc,
      selection: TextSelection.create(
        expandedDoc,
        1 + expandedDoc.firstChild!.content.size
      ),
      plugins: [collapsibleHeadingsPlugin()]
    })
    expect(createCollapsedHeadingExitTransaction(expanded)).toBeNull()
  })

  it("leaves modified Enter shortcuts to the editor keymap", () => {
    const plugin = collapsibleHeadingsPlugin()
    let state = collapsedHeadingState("# Project\n\nSecret\n", plugin)
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView

    for (const modifiers of [
      { shiftKey: true },
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true }
    ]) {
      const handled = plugin.props.handleKeyDown?.call(
        plugin,
        view,
        {
          key: "Enter",
          shiftKey: false,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          ...modifiers
        } as KeyboardEvent
      )
      expect(handled).toBe(false)
      expect(state.doc.childCount).toBe(2)
    }
  })
})

import { history } from "prosemirror-history"
import { EditorState, TextSelection, type Transaction } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { describe, expect, it, vi } from "vitest"
import { redoEditorChange, undoEditorChange } from "../editorHistory"
import { schema } from "../schema"
import {
  StructuralCaretSelection,
  structuralCaretAtBlock
} from "../structuralCaretSelection"
import { multiBlockSelectionPlugin } from "./multiBlockSelection"
import { structuralCaretPlugin } from "./structuralCaret"

interface TestView {
  view: EditorView
  state: () => EditorState
}

function createTestView(initialState: EditorState): TestView {
  let state = initialState
  const focus = vi.fn()
  const view = {
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = state.apply(transaction)
    },
    focus,
    endOfTextblock: () => true
  } as unknown as EditorView
  return { view, state: () => state }
}

function keyEvent(key: string): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false
  } as KeyboardEvent
}

function handleKey(view: EditorView, key: string): boolean {
  const plugin = structuralCaretPlugin()
  const handler = plugin.props.handleKeyDown
  return handler?.call(plugin, view, keyEvent(key)) ?? false
}

function specialNode(typeName: string) {
  if (typeName === "database_embed") {
    return schema.nodes.database_embed!.create({ source: "Projects" })
  }
  return schema.nodes.horizontal_rule!.create()
}

describe("structural caret navigation", () => {
  it.each(["database_embed", "horizontal_rule"])(
    "moves between the before and after positions of %s without selecting it",
    (typeName) => {
      const before = schema.nodes.paragraph!.create(null, schema.text("Before"))
      const special = specialNode(typeName)
      const after = schema.nodes.paragraph!.create(null, schema.text("After"))
      const doc = schema.nodes.doc!.create(null, [before, special, after])
      const specialPos = before.nodeSize
      const initialState = EditorState.create({
        doc,
        selection: structuralCaretAtBlock(doc, specialPos, "before")
      })
      const { view, state } = createTestView(initialState)

      expect(handleKey(view, "ArrowRight")).toBe(true)
      expect(state().selection).toBeInstanceOf(StructuralCaretSelection)
      expect((state().selection as StructuralCaretSelection).side).toBe("after")
      expect(state().selection.from).toBe(specialPos + special.nodeSize)

      expect(handleKey(view, "ArrowLeft")).toBe(true)
      expect(state().selection).toBeInstanceOf(StructuralCaretSelection)
      expect((state().selection as StructuralCaretSelection).side).toBe("before")
      expect(state().selection.from).toBe(specialPos)
    }
  )

  it("enters before a database from the preceding text and crosses it with ArrowRight", () => {
    const before = schema.nodes.paragraph!.create(null, schema.text("Before"))
    const database = specialNode("database_embed")
    const after = schema.nodes.paragraph!.create(null, schema.text("After"))
    const doc = schema.nodes.doc!.create(null, [before, database, after])
    const databasePos = before.nodeSize
    const initialState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, before.nodeSize - 1)
    })
    const { view, state } = createTestView(initialState)

    expect(handleKey(view, "ArrowRight")).toBe(true)
    expect(state().selection).toBeInstanceOf(StructuralCaretSelection)
    expect((state().selection as StructuralCaretSelection).side).toBe("before")
    expect(state().selection.from).toBe(databasePos)

    expect(handleKey(view, "ArrowRight")).toBe(true)
    expect((state().selection as StructuralCaretSelection).side).toBe("after")
    expect(state().selection.from).toBe(databasePos + database.nodeSize)
  })

  it("enters Mermaid as real code content and reveals source from view mode", () => {
    const before = schema.nodes.paragraph!.create(null, schema.text("Before"))
    const code = "graph TD; A-->B"
    const mermaid = schema.nodes.mermaid!.create(
      { mode: "view" },
      schema.text(code)
    )
    const doc = schema.nodes.doc!.create(null, [before, mermaid])
    const mermaidPos = before.nodeSize
    const initialState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, before.nodeSize - 1)
    })
    const { view, state } = createTestView(initialState)

    expect(handleKey(view, "ArrowRight")).toBe(true)
    expect(state().selection).toBeInstanceOf(TextSelection)
    expect(state().selection.$from.parent.type).toBe(schema.nodes.mermaid)
    expect(state().selection.$from.parentOffset).toBe(0)
    expect(state().doc.nodeAt(mermaidPos)?.attrs.mode).toBe("edit")
  })

  it("keeps distinct positions between adjacent special blocks", () => {
    const database = specialNode("database_embed")
    const divider = specialNode("horizontal_rule")
    const doc = schema.nodes.doc!.create(null, [database, divider])
    const initialState = EditorState.create({
      doc,
      selection: structuralCaretAtBlock(doc, 0, "after")
    })
    const { view, state } = createTestView(initialState)

    expect(handleKey(view, "ArrowRight")).toBe(true)
    expect(state().selection).toBeInstanceOf(StructuralCaretSelection)
    expect((state().selection as StructuralCaretSelection).side).toBe("before")
    expect(state().selection.from).toBe(database.nodeSize)

    expect(handleKey(view, "ArrowRight")).toBe(true)
    expect((state().selection as StructuralCaretSelection).side).toBe("after")
    expect(state().selection.from).toBe(database.nodeSize + divider.nodeSize)
  })
})

describe("structural caret deletion history", () => {
  it("deletes a database from its trailing position and uses ProseMirror undo/redo", () => {
    const before = schema.nodes.paragraph!.create(null, schema.text("Before"))
    const database = specialNode("database_embed")
    const after = schema.nodes.paragraph!.create(null, schema.text("After"))
    const doc = schema.nodes.doc!.create(null, [before, database, after])
    const databasePos = before.nodeSize
    const initialState = EditorState.create({
      doc,
      selection: structuralCaretAtBlock(doc, databasePos, "after"),
      plugins: [history(), multiBlockSelectionPlugin(schema)]
    })
    const { view, state } = createTestView(initialState)

    expect(handleKey(view, "Delete")).toBe(true)
    expect(state().doc.childCount).toBe(2)
    expect(state().doc.child(0)).toBe(before)
    expect(state().doc.child(1)).toBe(after)

    expect(undoEditorChange(state(), view.dispatch.bind(view))).toBe(true)
    expect(state().doc.childCount).toBe(3)
    expect(state().doc.child(1).type).toBe(schema.nodes.database_embed)
    expect(state().selection).toBeInstanceOf(StructuralCaretSelection)
    expect((state().selection as StructuralCaretSelection).side).toBe("after")

    expect(redoEditorChange(state(), view.dispatch.bind(view))).toBe(true)
    expect(state().doc.childCount).toBe(2)
    expect(state().doc.child(1).type).toBe(schema.nodes.paragraph)
  })

  it("keeps Mermaid source edits in the same ProseMirror history", () => {
    const code = "graph TD; A-->B"
    const mermaid = schema.nodes.mermaid!.create(
      { mode: "edit" },
      schema.text(code)
    )
    const doc = schema.nodes.doc!.create(null, mermaid)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, code.length + 1),
      plugins: [history()]
    })
    const dispatch = (transaction: Transaction) => {
      state = state.apply(transaction)
    }

    dispatch(state.tr.insertText("; B-->C"))
    expect(state.doc.firstChild?.textContent).toBe(
      "graph TD; A-->B; B-->C"
    )
    expect(undoEditorChange(state, dispatch)).toBe(true)
    expect(state.doc.firstChild?.textContent).toBe(code)
    expect(redoEditorChange(state, dispatch)).toBe(true)
    expect(state.doc.firstChild?.textContent).toBe(
      "graph TD; A-->B; B-->C"
    )
  })
})

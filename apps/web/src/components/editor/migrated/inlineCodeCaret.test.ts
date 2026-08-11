// @vitest-environment jsdom
import { EditorState, TextSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { afterEach, describe, expect, it } from "vitest"
import { schema } from "./schema"
import { inlineCodeCaretPlugin } from "./inlineCodeCaret"
import { serializeMarkdown } from "./markdown"

// `value` is five characters, so the closing boundary sits at 6.
const BOUNDARY = 6

const views: EditorView[] = []

function mountInlineCode(trailingText: string): EditorView {
  const code = schema.marks.code!.create()
  const content = [schema.text("value", [code])]
  if (trailingText) content.push(schema.text(trailingText))
  const doc = schema.nodes.doc!.create(
    null,
    schema.nodes.paragraph!.create(null, content)
  )
  const view = new EditorView(document.body.appendChild(document.createElement("div")), {
    state: EditorState.create({ doc, plugins: [inlineCodeCaretPlugin(schema)] })
  })
  views.push(view)
  view.focus()
  // Arrive at the boundary the way the editor does, through a transaction, so
  // the caret side is applied after ProseMirror has drawn the selection.
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, BOUNDARY)))
  return view
}

function pressKey(view: EditorView, key: string): boolean {
  const event = { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
  return Boolean(view.someProp(
    "handleKeyDown",
    (handler) => handler(view, event as unknown as KeyboardEvent)
  ))
}

function caretIsInsideCode(view: EditorView): boolean {
  const anchorNode = view.dom.ownerDocument.getSelection()?.anchorNode
  const element = anchorNode?.nodeType === 1
    ? (anchorNode as Element)
    : anchorNode?.parentElement
  return Boolean(element && view.dom.contains(element) && element.closest("code"))
}

// Types the way the browser does: ProseMirror reads the DOM change and inserts
// with the stored marks, so this is what decides which side of the mark a
// keystroke lands on.
function type(view: EditorView, text: string): "inside" | "outside" {
  const { from } = view.state.selection
  view.dispatch(view.state.tr.insertText(text, from, from))
  const inserted = view.state.doc.resolve(from + text.length).nodeBefore
  return inserted && schema.marks.code!.isInSet(inserted.marks) ? "inside" : "outside"
}

describe("inline code closing boundary", () => {
  afterEach(() => {
    while (views.length) views.pop()?.destroy()
    document.body.innerHTML = ""
  })

  it("starts outside the mark with the caret drawn after the code element", () => {
    const view = mountInlineCode(" after")

    expect(caretIsInsideCode(view)).toBe(false)
    expect(type(view, " ")).toBe("outside")
    expect(serializeMarkdown(view.state.doc)).toBe("`value`  after\n")
  })

  it("switches between exactly two caret states", () => {
    const view = mountInlineCode(" after")

    // Left picks the code side without moving: caret inside, typing inside.
    expect(pressKey(view, "ArrowLeft")).toBe(true)
    expect(view.state.selection.from).toBe(BOUNDARY)
    expect(caretIsInsideCode(view)).toBe(true)

    // Right returns to the outside state in one press. There is no third state
    // that draws the caret inside while typing lands outside.
    expect(pressKey(view, "ArrowRight")).toBe(true)
    expect(view.state.selection.from).toBe(BOUNDARY)
    expect(caretIsInsideCode(view)).toBe(false)
    expect(type(view, " ")).toBe("outside")

    // From outside, both arrows are ordinary caret moves again.
    expect(pressKey(view, "ArrowRight")).toBe(false)
  })

  it("keeps typing inside the mark after entering the code side", () => {
    const view = mountInlineCode(" after")

    expect(pressKey(view, "ArrowLeft")).toBe(true)
    expect(type(view, "s")).toBe("inside")
    // Insertion clears the stored marks; the code side survives it.
    expect(type(view, "!")).toBe("inside")
    expect(serializeMarkdown(view.state.doc)).toBe("`values!` after\n")
    expect(caretIsInsideCode(view)).toBe(true)
  })

  it("moves a second ArrowLeft through the code text", () => {
    const view = mountInlineCode(" after")

    expect(pressKey(view, "ArrowLeft")).toBe(true)
    expect(pressKey(view, "ArrowLeft")).toBe(false)
  })

  it("crosses the final code character straight into the outside state", () => {
    const view = mountInlineCode(" after")
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, BOUNDARY - 1))
    )
    expect(caretIsInsideCode(view)).toBe(true)

    expect(pressKey(view, "ArrowRight")).toBe(true)
    expect(view.state.selection.from).toBe(BOUNDARY)
    expect(caretIsInsideCode(view)).toBe(false)
    expect(type(view, " ")).toBe("outside")
  })

  it("drops the code side when the boundary is clicked", () => {
    const view = mountInlineCode(" after")

    expect(pressKey(view, "ArrowLeft")).toBe(true)
    view.someProp("handleDOMEvents", (handlers) => {
      handlers.mousedown?.(view, new MouseEvent("mousedown"))
      return true
    })
    expect(caretIsInsideCode(view)).toBe(false)
    expect(type(view, " ")).toBe("outside")
  })

  it("anchors the outside caret in text rather than in a placeholder element", () => {
    const view = mountInlineCode(" after")

    // A caret at an element position is drawn at the full line height, so the
    // outside state anchors to the text node after the code element and adds
    // nothing to the DOM.
    const selection = view.dom.ownerDocument.getSelection()
    expect(selection?.anchorNode?.nodeType).toBe(3)
    expect(selection?.anchorNode?.textContent).toBe(" after")
    expect(selection?.anchorOffset).toBe(0)
    expect(view.dom.querySelector("img")).toBeNull()
  })

  it("keeps both states usable when the code span ends its block", () => {
    const view = mountInlineCode("")

    // There is no text node after the code element to anchor an outside caret
    // to, so the caret stays where ProseMirror drew it and only the typing side
    // distinguishes the two states.
    expect(type(view, " ")).toBe("outside")
    expect(serializeMarkdown(view.state.doc)).toBe("`value` \n")

    const restored = mountInlineCode("")
    expect(pressKey(restored, "ArrowLeft")).toBe(true)
    expect(caretIsInsideCode(restored)).toBe(true)
    expect(type(restored, "!")).toBe("inside")
    expect(pressKey(restored, "ArrowRight")).toBe(true)
    expect(type(restored, "?")).toBe("outside")
    expect(serializeMarkdown(restored.state.doc)).toBe("`value!`?\n")
  })
})

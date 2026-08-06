// @vitest-environment jsdom
import { EditorState, TextSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { history } from "prosemirror-history"
import { describe, expect, it } from "vitest"
import { schema } from "../schema"
import {
  openSelectionToolbarLinkEditor,
  selectionToolbarPlugin,
  selectionToolbarPluginKey,
  setSelectionToolbarPreferences
} from "./selectionToolbar"
import { multiBlockSelectionPlugin } from "./multiBlockSelection"

describe("selection toolbar mode", () => {
  it("defaults to floating and accepts live mode changes through plugin state", () => {
    const plugin = selectionToolbarPlugin(schema)
    let state = EditorState.create({
      doc: schema.nodes.doc!.create(null, schema.nodes.paragraph!.create()),
      plugins: [plugin]
    })

    expect(selectionToolbarPluginKey.getState(state)).toEqual({
      mode: "floating",
      allowedUploadFileTypes: [],
      linkEditorRequestRevision: 0
    })
    state = state.apply(
      state.tr.setMeta(selectionToolbarPluginKey, { mode: "top" })
    )
    expect(selectionToolbarPluginKey.getState(state)).toEqual({
      mode: "top",
      allowedUploadFileTypes: [],
      linkEditorRequestRevision: 0
    })
    state = state.apply(
      state.tr.setMeta(selectionToolbarPluginKey, { mode: "bottom" })
    )
    expect(selectionToolbarPluginKey.getState(state)).toEqual({
      mode: "bottom",
      allowedUploadFileTypes: [],
      linkEditorRequestRevision: 0
    })
    state = state.apply(
      state.tr.setMeta(selectionToolbarPluginKey, { mode: "none" })
    )
    expect(selectionToolbarPluginKey.getState(state)).toEqual({
      mode: "none",
      allowedUploadFileTypes: [],
      linkEditorRequestRevision: 0
    })
  })

  it("renders expanded editor controls at either edge and removes hidden mode from layout", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const state = EditorState.create({
      doc: schema.nodes.doc!.create(null, schema.nodes.paragraph!.create()),
      plugins: [selectionToolbarPlugin(schema, "top", [".png", ".pdf"])]
    })
    const view = new EditorView(host, { state })
    const toolbar = document.body.querySelector<HTMLElement>('.selection-toolbar')

    expect(toolbar).not.toBeNull()
    expect(toolbar?.dataset.mode).toBe("top")
    expect(toolbar?.parentElement).toBe(document.body)
    expect(toolbar?.style.display).toBe("flex")
    expect(toolbar?.querySelector(".selection-toolbar-arrow-group")).not.toBeNull()
    expect(toolbar?.querySelector(".selection-toolbar-history-group")).not.toBeNull()
    expect(toolbar?.querySelector(".selection-toolbar-block-group")).not.toBeNull()
    expect(toolbar?.querySelector(".selection-toolbar-inline-group")).not.toBeNull()
    expect(toolbar?.querySelector(".selection-toolbar-delete-group")).not.toBeNull()
    expect(
      Array.from(toolbar?.querySelectorAll<HTMLElement>("[data-editor-toolbar-action]") ?? [])
        .slice(0, 4)
        .map((button) => button.dataset.editorToolbarAction)
    ).toEqual(["add-before", "add-after", "move-up", "move-down"])
    expect(toolbar?.querySelector('[data-editor-toolbar-action="add-before"]')).not.toBeNull()
    expect(toolbar?.querySelector('[data-editor-toolbar-action="add-after"]')).not.toBeNull()
    expect(toolbar?.querySelector('[data-editor-toolbar-action="move-up"]')).not.toBeNull()
    expect(toolbar?.querySelector('[data-editor-toolbar-action="move-down"]')).not.toBeNull()
    expect(toolbar?.querySelector('[data-editor-toolbar-action="undo"]')).not.toBeNull()
    expect(toolbar?.querySelector('[data-editor-toolbar-action="redo"]')).not.toBeNull()
    expect(toolbar?.querySelector('[data-editor-toolbar-action="delete-block"]')).not.toBeNull()
    expect(toolbar?.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="add-before"]')?.title)
      .toBe("Add before (⇧⌘↵)")
    expect(toolbar?.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="add-after"]')?.title)
      .toBe("Add after (⌘↵)")
    expect(toolbar?.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="move-up"]')?.title)
      .toBe("Move up (⌃⇧↑)")
    expect(toolbar?.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="move-down"]')?.title)
      .toBe("Move down (⌃⇧↓)")
    expect(toolbar?.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="undo"]')?.title)
      .toBe("Undo (⌘Z)")
    expect(toolbar?.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="redo"]')?.title)
      .toBe("Redo (⇧⌘Z)")
    expect(toolbar?.querySelector<HTMLButtonElement>(".link-btn")?.title)
      .toBe("Link (⌘⇧K)")
    expect(toolbar?.querySelectorAll("[data-block-type]")).toHaveLength(9)
    expect(
      Array.from(toolbar?.querySelectorAll<HTMLButtonElement>("[data-block-type]") ?? [])
        .every((button) => button.title.endsWith("(⌘/)"))
    ).toBe(true)
    expect(toolbar?.querySelector('[data-block-type="mermaid"]')).toBeNull()
    expect(toolbar?.querySelector('[data-block-type="table"]')).toBeNull()
    expect(toolbar?.querySelector('[data-block-type="horizontal_rule"]')).toBeNull()
    expect(
      toolbar?.querySelectorAll(".selection-toolbar-group").item(4)
        .classList.contains("selection-toolbar-delete-group")
    ).toBe(true)
    expect(toolbar?.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="upload-media"]')?.disabled)
      .toBe(false)

    setSelectionToolbarPreferences(view, {
      mode: "bottom",
      allowedUploadFileTypes: [".png", ".pdf"]
    })
    expect(toolbar?.dataset.mode).toBe("bottom")
    expect(toolbar?.style.display).toBe("flex")

    setSelectionToolbarPreferences(view, {
      mode: "none",
      allowedUploadFileTypes: [".png", ".pdf"]
    })
    expect(toolbar?.parentElement).toBe(document.body)
    expect(toolbar?.dataset.mode).toBe("none")
    expect(toolbar?.style.display).toBe("none")

    view.destroy()
    host.remove()
  })

  it("anchors the floating toolbar below highlighted text in editor document space", () => {
    const canvas = document.createElement("div")
    canvas.dataset.rumiEditorCanvas = ""
    const wrapper = document.createElement("div")
    wrapper.className = "prosemirror-editor-wrapper"
    const host = document.createElement("div")
    host.className = "prosemirror-editor"
    wrapper.appendChild(host)
    canvas.appendChild(wrapper)
    document.body.appendChild(canvas)

    let wrapperTop = 200
    Object.defineProperty(wrapper, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: wrapperTop + 800,
        height: 800,
        left: 100,
        right: 700,
        top: wrapperTop,
        width: 600,
        x: 100,
        y: wrapperTop,
        toJSON: () => ({})
      })
    })
    const paragraph = schema.nodes.paragraph!.create(
      null,
      schema.text("Highlighted text")
    )
    const doc = schema.nodes.doc!.create(null, paragraph)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [selectionToolbarPlugin(schema)]
    })
    const view = new EditorView(host, { state })
    Object.defineProperty(view, "coordsAtPos", {
      configurable: true,
      value: (pos: number) => ({
        bottom: 280,
        left: pos === 1 ? 180 : 380,
        right: pos === 1 ? 180 : 380,
        top: 260
      })
    })
    const toolbar = wrapper.querySelector<HTMLElement>(".selection-toolbar")!
    Object.defineProperty(toolbar, "offsetWidth", {
      configurable: true,
      value: 120
    })

    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5))
    )

    expect(toolbar.parentElement).toBe(wrapper)
    expect(toolbar.style.display).toBe("flex")
    expect(toolbar.style.left).toBe("120px")
    expect(toolbar.style.top).toBe("88px")

    // The stored document-local coordinate is unchanged when the wrapper
    // moves in the viewport, so browser scrolling carries toolbar and text
    // together without a fixed-position refresh loop.
    wrapperTop = 100
    canvas.dispatchEvent(new Event("scroll"))
    expect(toolbar.style.top).toBe("88px")

    view.destroy()
    canvas.remove()
  })

  it("executes arrow, block-change, and inline actions from their groups", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const first = schema.nodes.paragraph!.create(null, schema.text("One"))
    const second = schema.nodes.paragraph!.create(null, schema.text("Two"))
    const doc = schema.nodes.doc!.create(null, [first, second])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 4),
      plugins: [history(), multiBlockSelectionPlugin(schema), selectionToolbarPlugin(schema, "top")]
    })
    const view = new EditorView(host, { state })
    Object.defineProperty(view, "scrollToSelection", { value: () => {} })
    const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    await Promise.resolve()
    expect(toolbar.querySelector<HTMLElement>(".link-input-popup")?.style.display)
      .toBe("block")

    toolbar.querySelector<HTMLButtonElement>('[data-mark="bold"]')!.click()
    expect(schema.marks.bold!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .not.toBeNull()

    toolbar.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="undo"]')!.click()
    expect(schema.marks.bold!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeUndefined()

    toolbar.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="redo"]')!.click()
    expect(schema.marks.bold!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeDefined()

    toolbar.querySelector<HTMLButtonElement>(".link-btn")!.click()
    const linkPopup = toolbar.querySelector<HTMLElement>(".link-input-popup")!
    const linkInput = linkPopup.querySelector<HTMLInputElement>(".link-url-input")!
    linkInput.value = "https://example.com"
    linkPopup.querySelector<HTMLButtonElement>("button")!.click()
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.firstChild!.marks)?.attrs.href)
      .toBe("https://example.com")

    toolbar.querySelector<HTMLButtonElement>(
      '[data-block-type="heading"][data-block-attrs=\'{"level":1}\']'
    )!.click()
    expect(view.state.doc.firstChild?.type).toBe(schema.nodes.heading)
    expect(view.state.doc.firstChild?.attrs.level).toBe(1)

    toolbar.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="add-after"]')!.click()
    expect(view.state.doc.childCount).toBe(3)
    expect(view.state.doc.child(1).type).toBe(schema.nodes.paragraph)
    expect(view.state.doc.child(1).textContent).toBe("")

    toolbar.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="move-down"]')!.click()
    expect(view.state.doc.child(1).textContent).toBe("Two")
    expect(view.state.doc.child(2).textContent).toBe("")

    const secondBlockPos = view.state.doc.child(0).nodeSize
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, secondBlockPos + 1))
    )
    toolbar.querySelector<HTMLButtonElement>('[data-editor-toolbar-action="delete-block"]')!.click()
    expect(view.state.doc.childCount).toBe(2)
    expect(view.state.doc.child(1).textContent).toBe("")

    view.destroy()
    host.remove()
  })

  it("cancels a scheduled link editor request when the editor is destroyed", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Link me"))
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 8),
      plugins: [selectionToolbarPlugin(schema, "top")]
    })
    const view = new EditorView(host, { state })
    const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!
    const popup = toolbar.querySelector<HTMLElement>(".link-input-popup")!

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    view.destroy()
    await Promise.resolve()

    expect(popup.style.display).toBe("none")
    host.remove()
  })

  it("edits a caret link with its URL selected and unlinks on empty Enter", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const link = schema.marks.link!.create({ href: "Notes.md" })
    const bold = schema.marks.bold!.create()
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Linked text", [bold, link]))
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 4),
      plugins: [selectionToolbarPlugin(schema, "top")]
    })
    const view = new EditorView(host, { state })

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
    const input = popup.querySelector<HTMLInputElement>(".link-url-input")!
    expect(popup.style.display).toBe("block")
    expect(input.value).toBe("Notes.md")
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe("Notes.md".length)
    expect(popup.querySelector(".link-copy-btn")).not.toBeNull()
    expect(popup.querySelector(".link-open-btn")).not.toBeNull()
    expect(popup.querySelector(".link-unlink-btn")).not.toBeNull()

    input.value = ""
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeUndefined()
    expect(schema.marks.bold!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeDefined()

    view.destroy()
    host.remove()
  })

  it("opens only the link editor when the formatting toolbar is hidden", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const link = schema.marks.link!.create({ href: "Notes.md" })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Notes", [link]))
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
      plugins: [selectionToolbarPlugin(schema, "none")]
    })
    const view = new EditorView(host, { state })
    Object.defineProperty(view, "coordsAtPos", {
      value: () => ({ left: 20, right: 20, top: 20, bottom: 40 })
    })

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    await Promise.resolve()

    const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!
    expect(toolbar.classList.contains("link-editor-only")).toBe(true)
    expect(toolbar.dataset.mode).toBe("floating")
    expect(toolbar.querySelector<HTMLElement>(".link-input-popup")?.style.display)
      .toBe("block")

    view.destroy()
    host.remove()
  })
})

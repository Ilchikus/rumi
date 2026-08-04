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
    const linkInput = linkPopup.querySelector<HTMLInputElement>("input")!
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
})

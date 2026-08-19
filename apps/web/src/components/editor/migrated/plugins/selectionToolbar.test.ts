// @vitest-environment jsdom
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { history } from "prosemirror-history"
import { describe, expect, it, vi } from "vitest"
import { schema } from "../schema"
import {
  linkDestinationSuggestions,
  openSelectionToolbarLinkEditor,
  selectionToolbarPlugin,
  selectionToolbarPluginKey,
  setSelectionToolbarPreferences
} from "./selectionToolbar"
import {
  multiBlockSelectionKey,
  multiBlockSelectionPlugin
} from "./multiBlockSelection"
import { setMigratedEditorPlatform } from "../platform"
import { linkPlugin } from "./linkPlugin"

describe("link destination suggestions", () => {
  const documents = [
    { path: "archive/docs/todo.md", nodePath: "archive/docs/todo.md", title: "todo", kind: "page" as const },
    { path: "docs/todo-roadmap.md", nodePath: "docs/todo-roadmap.md", title: "todo-roadmap", kind: "page" as const },
    { path: "docs/todo.md", nodePath: "docs/todo.md", title: "todo", kind: "page" as const },
    { path: "todo.md", nodePath: "todo.md", title: "todo", kind: "page" as const }
  ]

  it("ranks root path prefixes ahead of matching filenames elsewhere", () => {
    expect(linkDestinationSuggestions(documents, "/docs/todo")).toEqual([
      "/docs/todo.md",
      "/docs/todo-roadmap.md",
      "/archive/docs/todo.md"
    ])
  })

  it("returns relative suggestions when the typed query is relative", () => {
    expect(linkDestinationSuggestions(documents, "todo")[0]).toBe("todo.md")
  })

  it("prioritizes folder and database title matches and returns their companion paths", () => {
    const structuralDocuments = [
      {
        path: "Milestones/Milestones.index.md",
        nodePath: "Milestones",
        title: "Milestones",
        kind: "folder" as const
      },
      {
        path: "Milestones/inner-page.md",
        nodePath: "Milestones/inner-page.md",
        title: "inner-page",
        kind: "page" as const
      },
      {
        path: "Events/Events.db.md",
        nodePath: "Events",
        title: "Events",
        kind: "database" as const
      },
      {
        path: "Events/inner.md",
        nodePath: "Events/inner.md",
        title: "inner",
        kind: "page" as const
      }
    ]

    expect(linkDestinationSuggestions(structuralDocuments, "milesto")[0])
      .toBe("Milestones/Milestones.index.md")
    expect(linkDestinationSuggestions(structuralDocuments, "event")[0])
      .toBe("Events/Events.db.md")
  })
})

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

  it("clears the text highlight and closes the floating toolbar after formatting", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Text"))
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
        plugins: [selectionToolbarPlugin(schema, "floating")]
      })
    })
    Object.defineProperty(view, "coordsAtPos", {
      value: () => ({ left: 20, right: 20, top: 20, bottom: 40 })
    })
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5))
    )
    const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!

    expect(toolbar.style.display).toBe("flex")
    toolbar.querySelector<HTMLButtonElement>('[data-mark="bold"]')!.click()

    expect(schema.marks.bold!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeDefined()
    expect(view.state.selection.empty).toBe(true)
    expect(view.state.selection.from).toBe(5)
    expect(view.state.selection.to).toBe(5)
    expect(toolbar.style.display).toBe("none")

    view.destroy()
    host.remove()
  })

  it.each(["top", "bottom"] as const)(
    "preserves the text highlight after formatting in %s mode",
    (mode) => {
      const host = document.createElement("div")
      document.body.appendChild(host)
      const doc = schema.nodes.doc!.create(
        null,
        schema.nodes.paragraph!.create(null, schema.text("Text"))
      )
      const view = new EditorView(host, {
        state: EditorState.create({
          doc,
          selection: TextSelection.create(doc, 1, 5),
          plugins: [selectionToolbarPlugin(schema, mode)]
        })
      })
      const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!

      toolbar.querySelector<HTMLButtonElement>('[data-mark="bold"]')!.click()

      expect(schema.marks.bold!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
        .toBeDefined()
      expect(view.state.selection.from).toBe(1)
      expect(view.state.selection.to).toBe(5)
      expect(toolbar.style.display).toBe("flex")

      view.destroy()
      host.remove()
    }
  )

  it("clears a floating block highlight and toolbar after formatting", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const paragraph = schema.nodes.paragraph!.create(null, schema.text("Text"))
    const doc = schema.nodes.doc!.create(null, paragraph)
    const plugins = [
      multiBlockSelectionPlugin(schema),
      selectionToolbarPlugin(schema, "floating")
    ]
    let state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins
    })
    state = state.apply(
      state.tr
        .setMeta(multiBlockSelectionKey, {
          selectedBlocks: [0],
          anchorBlock: 0
        })
        .setMeta("multiBlockKeep", true)
    )
    const view = new EditorView(host, { state })
    const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!

    expect(toolbar.style.display).toBe("flex")
    toolbar.querySelector<HTMLButtonElement>('[data-mark="bold"]')!.click()

    expect(schema.marks.bold!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeDefined()
    expect(multiBlockSelectionKey.getState(view.state)?.selectedBlocks).toEqual([])
    expect(view.state.selection).toBeInstanceOf(TextSelection)
    expect(view.state.selection.empty).toBe(true)
    expect(toolbar.style.display).toBe("none")

    view.destroy()
    host.remove()
  })

  it("collapses the selection and hides the floating toolbar on Escape", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Text"))
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
        plugins: [selectionToolbarPlugin(schema, "floating")]
      })
    })
    Object.defineProperty(view, "coordsAtPos", {
      value: () => ({ left: 20, right: 20, top: 20, bottom: 40 })
    })
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5))
    )
    const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    })

    expect(view.dom.dispatchEvent(escape)).toBe(false)
    expect(escape.defaultPrevented).toBe(true)
    expect(view.state.selection.empty).toBe(true)
    expect(view.state.selection.from).toBe(5)
    expect(toolbar.style.display).toBe("none")

    view.destroy()
    host.remove()
  })

  it("closes a floating link editor and clears its text highlight on Escape", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Text"))
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
        plugins: [selectionToolbarPlugin(schema, "floating")]
      })
    })
    Object.defineProperty(view, "coordsAtPos", {
      value: () => ({ left: 20, right: 20, top: 20, bottom: 40 })
    })
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5))
    )
    const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!
    toolbar.querySelector<HTMLButtonElement>(".link-btn")!.click()
    const popup = toolbar.querySelector<HTMLElement>(".link-input-popup")!
    const input = popup.querySelector<HTMLInputElement>(".link-url-input")!

    expect(popup.style.display).toBe("block")
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    }))

    expect(view.state.selection.empty).toBe(true)
    expect(view.state.selection.from).toBe(5)
    expect(popup.style.display).toBe("none")
    expect(toolbar.style.display).toBe("none")

    view.destroy()
    host.remove()
  })

  it.each(["top", "bottom", "none"] as const)(
    "preserves the text highlight on Escape in %s mode",
    (mode) => {
      const host = document.createElement("div")
      document.body.appendChild(host)
      const doc = schema.nodes.doc!.create(
        null,
        schema.nodes.paragraph!.create(null, schema.text("Text"))
      )
      const view = new EditorView(host, {
        state: EditorState.create({
          doc,
          selection: TextSelection.create(doc, 1, 5),
          plugins: [selectionToolbarPlugin(schema, mode)]
        })
      })

      view.dom.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true
      }))

      expect(view.state.selection.from).toBe(1)
      expect(view.state.selection.to).toBe(5)

      view.destroy()
      host.remove()
    }
  )

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

    expect(toolbar.hasAttribute("data-rumi-area-selection-exclude")).toBe(true)
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
    linkPopup.querySelector<HTMLButtonElement>(".link-apply-btn")!.click()
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
    expect(popup.querySelector(".link-apply-btn")).not.toBeNull()
    const inputRow = popup.querySelector(".link-input-row")!
    for (const selector of [
      ".link-copy-btn",
      ".link-open-btn",
      ".link-unlink-btn",
      ".link-apply-btn"
    ]) {
      const action = popup.querySelector<HTMLButtonElement>(selector)!
      expect(action.parentElement).toBe(inputRow)
      expect(action.textContent).toBe("")
      expect(action.getAttribute("aria-label")).toBeTruthy()
    }

    input.value = ""
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeUndefined()
    expect(schema.marks.bold!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeDefined()

    view.destroy()
    host.remove()
  })

  it("places the caret after the complete external link when applying it", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Link me"))
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 8),
      plugins: [selectionToolbarPlugin(schema, "top"), linkPlugin(schema)]
    })
    const view = new EditorView(host, { state })

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    await Promise.resolve()
    const popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
    const input = popup.querySelector<HTMLInputElement>(".link-url-input")!
    input.value = "https://example.com"
    dispatchPrimaryClick(popup.querySelector<HTMLButtonElement>(".link-apply-btn")!)

    expect(view.state.selection.from).toBe(9)
    expect(view.state.selection.empty).toBe(true)
    expect(view.state.doc.nodeAt(1)?.type.name).toBe("link_marker")
    expect(view.state.doc.nodeAt(1)?.attrs.linkType).toBe("external")
    const icon = view.dom.querySelector<HTMLElement>('.rumi-link-icon[data-link-type="external"]')
    expect(icon).not.toBeNull()
    expect(icon?.dataset.href).toBe("https://example.com")

    view.destroy()
    host.remove()
  })

  it("creates a leading internal-link icon while leaving the caret after the anchor", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Link me"))
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 8),
      plugins: [selectionToolbarPlugin(schema, "top"), linkPlugin(schema)]
    })
    const view = new EditorView(host, { state })

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    await Promise.resolve()
    const popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
    const input = popup.querySelector<HTMLInputElement>(".link-url-input")!
    input.value = "Projects.db.md"
    dispatchPrimaryClick(popup.querySelector<HTMLButtonElement>(".link-apply-btn")!)

    expect(view.state.selection.from).toBe(9)
    expect(view.state.selection.empty).toBe(true)
    expect(view.state.doc.nodeAt(1)?.type.name).toBe("link_marker")
    expect(view.state.doc.nodeAt(1)?.attrs.linkType).toBe("internal")
    expect(view.state.doc.nodeAt(1)?.attrs.mentionKind).toBe("database")
    const icon = view.dom.querySelector<HTMLElement>('.rumi-link-icon[data-link-type="internal"]')
    expect(icon).not.toBeNull()
    expect(icon?.dataset.href).toBe("Projects.db.md")
    expect(icon?.dataset.linkKind).toBe("database")

    view.destroy()
    host.remove()
  })

  it("moves the derived icon when a destination changes between internal and external", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const internalLink = schema.marks.link!.create({ href: "Notes.md" })
    const internalMarker = schema.nodes.link_marker!.create({
      href: "Notes.md",
      linkType: "internal",
      mentionKind: "page"
    })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        internalMarker,
        schema.text("Link me", [internalLink])
      ])
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 4),
        plugins: [selectionToolbarPlugin(schema, "top"), linkPlugin(schema)]
      })
    })

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    await Promise.resolve()
    let popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
    popup.querySelector<HTMLInputElement>(".link-url-input")!.value = "https://example.com"
    dispatchPrimaryClick(popup.querySelector<HTMLButtonElement>(".link-apply-btn")!)

    expect(view.dom.querySelector('.rumi-link-icon[data-link-type="internal"]')).toBeNull()
    expect(view.state.doc.nodeAt(1)?.type.name).toBe("link_marker")
    expect(view.state.doc.nodeAt(1)?.attrs.linkType).toBe("external")
    expect(view.state.selection.from).toBe(9)

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    await Promise.resolve()
    popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
    popup.querySelector<HTMLInputElement>(".link-url-input")!.value = "Projects.db.md"
    dispatchPrimaryClick(popup.querySelector<HTMLButtonElement>(".link-apply-btn")!)

    expect(view.dom.querySelector('.rumi-link-icon[data-link-type="external"]')).toBeNull()
    expect(view.state.doc.nodeAt(1)?.type.name).toBe("link_marker")
    expect(view.state.doc.nodeAt(1)?.attrs.linkType).toBe("internal")
    expect(view.state.doc.nodeAt(1)?.attrs.mentionKind).toBe("database")
    expect(view.state.selection.from).toBe(9)

    view.destroy()
    host.remove()
  })

  it("shows normal-weight baseline-aligned suggestions with only the match in black", () => {
    setMigratedEditorPlatform({
      databaseRefreshRevisions: {},
      workspaceKey: "workspace",
      documentKey: "current.md",
      documents: [
        { path: "archive/docs/todo.md", nodePath: "archive/docs/todo.md", title: "todo", kind: "page" },
        { path: "docs/todo-roadmap.md", nodePath: "docs/todo-roadmap.md", title: "todo-roadmap", kind: "page" },
        { path: "docs/todo.md", nodePath: "docs/todo.md", title: "todo", kind: "page" },
        {
          path: "Contracts/server-events.md",
          nodePath: "Contracts/server-events.md",
          title: "server-events",
          kind: "page"
        }
      ]
    })
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

    toolbar.querySelector<HTMLButtonElement>(".link-btn")!.click()
    const input = toolbar.querySelector<HTMLInputElement>(".link-url-input")!
    const ghost = toolbar.querySelector<HTMLElement>(".link-url-inline-suggestion")!
    input.focus()
    input.value = "/docs/to"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    expect(input.dataset.suggestion).toBe("/docs/todo.md")
    expect(ghost.textContent).toBe("/docs/todo.md")
    expect(input.style.borderTopWidth).toBe("0px")
    expect(input.style.borderBottomWidth).toBe("1px")
    expect(input.style.fontWeight).toBe("400")
    expect(ghost.style.fontWeight).toBe(input.style.fontWeight)
    expect(ghost.style.lineHeight).toBe(input.style.lineHeight)
    expect(ghost.style.paddingBottom).toBe(input.style.paddingBottom)

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    expect(input.dataset.suggestion).toBe("/docs/todo-roadmap.md")

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    expect(input.dataset.suggestion).toBe("/docs/todo-roadmap.md")

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
    expect(input.dataset.suggestion).toBe("/docs/todo-roadmap.md")

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }))
    expect(input.dataset.suggestion).toBe("/docs/todo.md")

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))
    expect(input.value).toBe("/docs/todo.md")
    expect(input.dataset.suggestion).toBeUndefined()
    expect(document.activeElement).toBe(input)

    input.value = "event"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const match = ghost.querySelector<HTMLElement>(".link-url-suggestion-match")!
    const muted = ghost.querySelector<HTMLElement>(".link-url-suggestion-muted")!
    expect(input.dataset.suggestion).toBe("Contracts/server-events.md")
    expect(ghost.textContent).toBe("event  → Contracts/server-events.md")
    expect(match.textContent).toBe("event")
    expect(match.style.color).not.toBe(muted.style.color)

    view.destroy()
    host.remove()
    setMigratedEditorPlatform({
      databaseRefreshRevisions: {},
      workspaceKey: "",
      documentKey: "",
      documents: []
    })
  })

  it("commits the active internal path and keeps it separate from the anchor name", async () => {
    setMigratedEditorPlatform({
      databaseRefreshRevisions: {},
      workspaceKey: "workspace",
      documentKey: "docs/test/inner/test⧸1.md",
      documents: [{
        path: "Contracts/editor-save-contract.md",
        nodePath: "Contracts/editor-save-contract.md",
        title: "editor-save-contract",
        kind: "page"
      }]
    })
    const host = document.createElement("div")
    document.body.appendChild(host)
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("editor"))
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1, 7),
        plugins: [selectionToolbarPlugin(schema, "top"), linkPlugin(schema)]
      })
    })
    const toolbar = document.body.querySelector<HTMLElement>(".selection-toolbar")!
    toolbar.querySelector<HTMLButtonElement>(".link-btn")!.click()
    const input = toolbar.querySelector<HTMLInputElement>(".link-url-input")!
    input.value = "editor"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    expect(input.dataset.suggestion).toBe("Contracts/editor-save-contract.md")
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    const anchor = view.state.doc.firstChild?.child(1)
    expect(schema.marks.link!.isInSet(anchor?.marks ?? [])?.attrs.href)
      .toBe("Contracts/editor-save-contract.md")
    expect(view.state.doc.firstChild?.child(0).attrs).toMatchObject({
      linkType: "internal",
      href: "Contracts/editor-save-contract.md"
    })

    expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(toolbar.querySelector<HTMLInputElement>(".link-url-input")?.value)
      .toBe("Contracts/editor-save-contract.md")
    expect(toolbar.querySelector<HTMLInputElement>(".link-text-input")?.value)
      .toBe("editor")

    view.destroy()
    host.remove()
    setMigratedEditorPlatform({
      databaseRefreshRevisions: {},
      workspaceKey: "",
      documentKey: "",
      documents: []
    })
  })

  it("shows a checkmark for 500ms after copying before closing the link editor", async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    })
    const host = document.createElement("div")
    document.body.appendChild(host)
    const link = schema.marks.link!.create({ href: "Notes.md" })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Notes", [link]))
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 3),
        plugins: [selectionToolbarPlugin(schema, "top")]
      })
    })

    try {
      expect(openSelectionToolbarLinkEditor(view.state, view.dispatch)).toBe(true)
      await Promise.resolve()
      const popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
      const copyButton = popup.querySelector<HTMLButtonElement>(".link-copy-btn")!
      dispatchPrimaryClick(copyButton)
      await Promise.resolve()
      await Promise.resolve()

      expect(writeText).toHaveBeenCalledWith("Notes.md")
      expect(copyButton.getAttribute("aria-label")).toBe("Copied")
      expect(copyButton.classList.contains("copied")).toBe(true)
      expect(popup.style.display).toBe("block")

      vi.advanceTimersByTime(499)
      expect(popup.style.display).toBe("block")
      vi.advanceTimersByTime(1)
      expect(popup.style.display).toBe("none")
    } finally {
      view.destroy()
      host.remove()
      Reflect.deleteProperty(navigator, "clipboard")
      vi.useRealTimers()
    }
  })

  it("removes a highlighted link without changing selection or editor scroll", () => {
    const canvas = document.createElement("div")
    canvas.dataset.rumiEditorCanvas = ""
    const host = document.createElement("div")
    canvas.appendChild(host)
    document.body.appendChild(canvas)
    canvas.scrollTop = 640
    canvas.scrollLeft = 18
    const link = schema.marks.link!.create({ href: "https://example.com" })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Linked text", [link]))
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 12),
      plugins: [selectionToolbarPlugin(schema, "top")]
    })
    const view = new EditorView(host, { state })
    const nativeFocus = view.focus.bind(view)
    Object.defineProperty(view, "focus", {
      value: () => {
        canvas.scrollTop = 0
        canvas.scrollLeft = 0
        nativeFocus()
      }
    })

    document.body.querySelector<HTMLButtonElement>(".selection-toolbar .link-btn")!.click()

    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeUndefined()
    expect(view.state.selection.from).toBe(1)
    expect(view.state.selection.to).toBe(12)
    expect(canvas.scrollTop).toBe(640)
    expect(canvas.scrollLeft).toBe(18)

    view.destroy()
    canvas.remove()
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

function dispatchPrimaryClick(target: HTMLElement): void {
  target.dispatchEvent(new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0
  }))
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0
  }))
  target.dispatchEvent(new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: 0
  }))
  target.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0
  }))
}

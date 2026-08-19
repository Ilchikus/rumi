// @vitest-environment jsdom
import { DOMSerializer } from "prosemirror-model"
import { baseKeymap } from "prosemirror-commands"
import { keymap } from "prosemirror-keymap"
import { EditorState, TextSelection, type Transaction } from "prosemirror-state"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EditorView } from "prosemirror-view"
import { linkClickIntent, linkPlugin } from "./linkPlugin"
import { selectionToolbarPlugin } from "./selectionToolbar"
import { schema } from "../schema"
import { serializeMarkdown } from "../markdown"
import { setMigratedEditorPlatform } from "../platform"
import { buildKeymap } from "../keymap"

afterEach(() => {
  setMigratedEditorPlatform({
    databaseRefreshRevisions: {},
    workspaceKey: "",
    documentKey: "",
    documents: []
  })
})

describe("link context menu interaction", () => {
  it("prevents the native link menu and opens the shared URL editor", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const plugin = linkPlugin(schema)
    const contextMenuHandler = plugin.props.handleDOMEvents?.contextmenu
    const linkMark = schema.marks.link!.create({ href: "Notes.md" })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Notes", [linkMark]))
    )
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [selectionToolbarPlugin(schema, "top"), plugin]
    })
    const view = new EditorView(host, { state })
    const link = view.dom.querySelector("a")!
    const preventDefault = vi.fn()
    const contextHandled = contextMenuHandler?.call(
      plugin,
      view,
      { button: 2, target: link, preventDefault } as unknown as PointerEvent
    )
    await Promise.resolve()

    expect(contextHandled).toBe(true)
    expect(preventDefault).toHaveBeenCalledOnce()
    const popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
    expect(popup.style.display).toBe("block")
    expect(popup.querySelector<HTMLInputElement>(".link-url-input")?.value).toBe("Notes.md")

    view.destroy()
    host.remove()
  })

  it("does not create a link editor on hover", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const linkMark = schema.marks.link!.create({ href: "Notes.md" })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Notes", [linkMark]))
    )
    const view = new EditorView(host, {
      state: EditorState.create({ doc, plugins: [linkPlugin(schema)] })
    })

    view.dom.querySelector("a")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))

    expect(document.body.querySelector(".link-hover-tooltip")).toBeNull()
    expect(document.body.querySelector(".link-input-popup")).toBeNull()

    view.destroy()
    host.remove()
  })

  it("opens the shared link editor from secondary mousedown when the app suppresses it", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const linkMark = schema.marks.link!.create({ href: "Notes.md" })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Notes", [linkMark]))
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        plugins: [selectionToolbarPlugin(schema, "top"), linkPlugin(schema)]
      })
    })
    const suppressSecondarySelection = (event: Event) => event.preventDefault()
    document.addEventListener("mousedown", suppressSecondarySelection, true)

    view.dom.querySelector("a")!.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 2
    }))
    await Promise.resolve()

    const popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
    expect(popup.style.display).toBe("block")
    expect(popup.querySelector<HTMLInputElement>(".link-url-input")?.value).toBe("Notes.md")

    dispatchPrimaryClick(popup.querySelector<HTMLButtonElement>(".link-unlink-btn")!)
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeUndefined()
    expect(popup.style.display).toBe("none")

    document.removeEventListener("mousedown", suppressSecondarySelection, true)
    view.destroy()
    host.remove()
  })

  it("opens the same right-click editor from a leading internal-link icon", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const linkMark = schema.marks.link!.create({ href: "Notes.md" })
    const marker = schema.nodes.link_marker!.create({
      href: "Notes.md",
      linkType: "internal",
      mentionKind: "page"
    })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        marker,
        schema.text("My notes", [linkMark])
      ])
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        plugins: [selectionToolbarPlugin(schema, "top"), linkPlugin(schema)]
      })
    })

    view.dom.querySelector<HTMLElement>('.rumi-link-icon[data-link-type="internal"]')!.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 2
      })
    )
    await Promise.resolve()

    const popup = document.body.querySelector<HTMLElement>(".link-input-popup")!
    expect(popup.style.display).toBe("block")
    expect(popup.querySelector<HTMLInputElement>(".link-url-input")?.value)
      .toBe("Notes.md")
    expect(popup.querySelector<HTMLInputElement>(".link-text-input")?.value)
      .toBe("My notes")

    view.destroy()
    host.remove()
  })

  it("leaves context-menu events outside links for other app handlers", () => {
    const plugin = linkPlugin(schema)
    const handler = plugin.props.handleDOMEvents?.contextmenu
    const preventPlainText = vi.fn()

    expect(handler?.call(
      plugin,
      {} as EditorView,
      { button: 2, target: { closest: () => null }, preventDefault: preventPlainText } as unknown as PointerEvent
    )).toBe(false)
    expect(preventPlainText).not.toHaveBeenCalled()
  })

  it("places a caret on plain link click and opens only the requested disposition", () => {
    const plugin = linkPlugin(schema)
    const linkMark = schema.marks.link!.create({ href: "https://example.com" })
    const marker = schema.nodes.link_marker!.create({
      href: "https://example.com",
      linkType: "external"
    })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        marker,
        schema.text("Example", [linkMark])
      ])
    )
    let state = EditorState.create({ doc })
    const focus = vi.fn()
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      },
      focus
    } as unknown as EditorView
    const link = document.createElement("a")
    link.href = "https://example.com"
    Object.defineProperty(link, "getClientRects", {
      value: () => [{ left: 0, right: 100, top: 0, bottom: 20 }]
    })
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    const handleClick = plugin.props.handleClick!

    const plainEvent = clickEvent(link, { clientX: 20 })
    expect(handleClick.call(plugin, view, 3, plainEvent)).toBe(true)
    expect(plainEvent.preventDefault).toHaveBeenCalledOnce()
    expect(state.selection.empty).toBe(true)
    expect(state.selection.from).toBe(3)
    expect(focus).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()

    expect(linkClickIntent(link, clickEvent(link, { clientX: 20, metaKey: true })))
      .toBe("new-tab")
    handleClick.call(plugin, view, 3, clickEvent(link, { clientX: 20, metaKey: true }))
    expect(open).toHaveBeenLastCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer"
    )

    const internalLink = document.createElement("a")
    internalLink.setAttribute("href", "Notes.md")
    expect(linkClickIntent(
      internalLink,
      clickEvent(internalLink, { metaKey: true })
    )).toBe("new-tab")

    expect(linkClickIntent(link, clickEvent(link, { shiftKey: true })))
      .toBe("current-tab")
    expect(linkClickIntent(internalLink, clickEvent(internalLink, { shiftKey: true })))
      .toBe("current-tab")

    expect(linkClickIntent(link, clickEvent(link, { clientX: 95 })))
      .toBe("caret")
    handleClick.call(plugin, view, 3, clickEvent(link, { clientX: 95 }))
    expect(open).toHaveBeenCalledTimes(1)

    expect(linkClickIntent(link, clickEvent(link, { clientX: 20, ctrlKey: true })))
      .toBe("new-tab")
  })

  it("opens both link icons with their explicit click disposition", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const externalHref = "https://example.com"
    const internalHref = "Notes.md"
    const externalMark = schema.marks.link!.create({ href: externalHref })
    const internalMark = schema.marks.link!.create({ href: internalHref })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        schema.nodes.link_marker!.create({ href: externalHref, linkType: "external" }),
        schema.text("External", [externalMark]),
        schema.text(" "),
        schema.nodes.link_marker!.create({
          href: internalHref,
          linkType: "internal",
          mentionKind: "page"
        }),
        schema.text("Internal", [internalMark])
      ])
    )
    const focusedTab = { focus: vi.fn() } as unknown as Window
    const open = vi.spyOn(window, "open").mockReturnValue(focusedTab)
    const openDocument = vi.fn()
    setMigratedEditorPlatform({
      databaseRefreshRevisions: {},
      workspaceKey: "workspace",
      documentKey: "Current.md",
      documents: [],
      openDocument
    })
    const view = new EditorView(host, {
      state: EditorState.create({ doc, plugins: [linkPlugin(schema)] })
    })
    const externalIcon = view.dom.querySelector<HTMLElement>(
      '.rumi-link-icon[data-link-type="external"]'
    )!
    const internalIcon = view.dom.querySelector<HTMLElement>(
      '.rumi-link-icon[data-link-type="internal"]'
    )!
    const [externalAnchor, internalAnchor] = Array.from(
      view.dom.querySelectorAll<HTMLAnchorElement>("a")
    )

    expect(externalIcon.className).toBe("rumi-link-icon")
    expect(internalIcon.className).toBe("rumi-link-icon")

    dispatchLinkIconClick(externalIcon)
    expect(open).toHaveBeenLastCalledWith(
      externalHref,
      "_blank",
      "noopener,noreferrer"
    )
    expect(focusedTab.focus).toHaveBeenCalledOnce()

    dispatchLinkIconClick(externalIcon, { shiftKey: true })
    expect(open).toHaveBeenLastCalledWith(externalHref, "_self", undefined)

    Object.defineProperty(view, "posAtDOM", {
      value: () => {
        throw new Error("icon activation must use the marker-owned href")
      }
    })
    dispatchLinkIconClick(internalIcon)
    expect(openDocument).toHaveBeenLastCalledWith(internalHref, "current")
    dispatchLinkIconClick(internalIcon, { shiftKey: true })
    expect(openDocument).toHaveBeenLastCalledWith(internalHref, "current")
    dispatchLinkIconClick(internalIcon, { metaKey: true })
    expect(openDocument).toHaveBeenLastCalledWith(internalHref, "new")

    dispatchLinkIconClick(externalAnchor!, { shiftKey: true })
    expect(open).toHaveBeenLastCalledWith(externalHref, "_self", undefined)
    dispatchLinkIconClick(internalAnchor!, { shiftKey: true })
    expect(openDocument).toHaveBeenLastCalledWith(internalHref, "current")

    view.destroy()
    host.remove()
  })

  it("sizes the icon-boundary caret from its textblock's computed font size", () => {
    const style = document.createElement("style")
    style.textContent = ".ProseMirror h1 { font-size: 34px; }"
    document.head.appendChild(style)
    const host = document.createElement("div")
    document.body.appendChild(host)
    const href = "Notes.md"
    const linkMark = schema.marks.link!.create({ href })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.heading!.create({ level: 1 }, [
        schema.nodes.link_marker!.create({
          href,
          linkType: "internal",
          mentionKind: "page"
        }),
        schema.text("Notes", [linkMark])
      ])
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
        plugins: [linkPlugin(schema)]
      })
    })

    expect(view.dom.querySelector<HTMLElement>(".rumi-link-boundary-caret")?.style.height)
      .toBe("34px")

    view.destroy()
    host.remove()
    style.remove()
  })

  it("decorates external and internal anchors with their distinct visual metadata", () => {
    const external = schema.marks.link!.create({ href: "www.example.com" })
    const internal = schema.marks.link!.create({ href: "Notes.md" })
    const database = schema.marks.link!.create({ href: "Projects.db.md" })
    const folder = schema.marks.link!.create({ href: "Notes.index.md" })
    const paragraph = schema.nodes.paragraph!.create(null, [
      schema.text("External", [external]),
      schema.text(" and "),
      schema.text("Internal", [internal]),
      schema.text(" database", [database]),
      schema.text(" folder", [folder])
    ])
    const wrapper = document.createElement("div")
    wrapper.appendChild(
      DOMSerializer.fromSchema(schema).serializeFragment(paragraph.content)
    )
    const links = wrapper.querySelectorAll("a")

    expect(links[0]?.getAttribute("href")).toBe("https://www.example.com")
    expect(links[0]?.dataset.externalLink).toBe("true")
    expect(links[1]?.getAttribute("href")).toBe("Notes.md")
    expect(links[1]?.hasAttribute("data-external-link")).toBe(false)
    expect(links[1]?.dataset.internalLink).toBe("true")
    expect(links[1]?.dataset.mentionKind).toBe("page")
    expect(links[2]?.dataset.mentionKind).toBe("database")
    expect(links[3]?.dataset.mentionKind).toBe("folder")
  })

  it("treats the leading external globe as an outside-to-anchor caret boundary", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const linkMark = schema.marks.link!.create({ href: "https://example.com" })
    const marker = schema.nodes.link_marker!.create({
      href: "https://example.com",
      linkType: "external"
    })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        marker,
        schema.text("Example", [linkMark])
      ])
    )
    const plugin = linkPlugin(schema)
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
        plugins: [plugin]
      })
    })
    const handleKeyDown = plugin.props.handleKeyDown!
    const icon = view.dom.querySelector<HTMLElement>('.rumi-link-icon[data-link-type="external"]')!

    expect(icon).not.toBeNull()
    expect(icon.textContent).toBe("")
    expect(icon.dataset.href).toBe("https://example.com")
    expect(icon.closest("a")).toBeNull()
    expect(view.state.doc.firstChild?.child(0).type.name).toBe("link_marker")
    expect(view.state.doc.firstChild?.child(0).attrs.linkType).toBe("external")
    expect(view.state.doc.textContent).toBe("Example")
    expect(serializeMarkdown(view.state.doc)).toBe("[Example](https://example.com)\n")
    expect(view.dom.querySelector(".rumi-link-boundary-caret")).not.toBeNull()
    expect(view.dom.classList.contains("rumi-link-boundary-native-caret-hidden")).toBe(true)

    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 9))
    )
    expect(icon.classList.contains("rumi-link-icon-selected")).toBe(true)
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )

    const moveAfter = keyEvent("ArrowRight")
    expect(handleKeyDown.call(plugin, view, moveAfter)).toBe(true)
    expect(moveAfter.preventDefault).toHaveBeenCalledOnce()
    expect(view.state.selection.from).toBe(2)
    expect(schema.marks.link!.isInSet(view.state.storedMarks ?? [])).toBeDefined()
    expect(view.dom.querySelector(".rumi-link-boundary-caret")).toBeNull()
    expect(view.dom.classList.contains("rumi-link-boundary-native-caret-hidden")).toBe(false)

    view.dispatch(view.state.tr.insertText("!"))
    expect(view.state.doc.textContent).toBe("!Example")
    expect(view.state.doc.firstChild?.child(0).type.name).toBe("link_marker")
    expect(view.state.doc.firstChild?.child(1).text).toBe("!Example")
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.child(1).marks))
      .toBeDefined()

    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, 2))
        .setStoredMarks(null)
    )
    const moveBefore = keyEvent("ArrowLeft")
    expect(handleKeyDown.call(plugin, view, moveBefore)).toBe(true)
    expect(view.state.selection.from).toBe(1)
    expect(schema.marks.link!.isInSet(view.state.storedMarks ?? [])).toBeUndefined()

    expect(handleKeyDown.call(plugin, view, keyEvent("ArrowRight"))).toBe(true)
    expect(view.state.selection.from).toBe(2)
    const unlink = keyEvent("Backspace")
    expect(handleKeyDown.call(plugin, view, unlink)).toBe(true)
    expect(unlink.preventDefault).toHaveBeenCalledOnce()
    expect(view.state.doc.textContent).toBe("!Example")
    expect(view.state.selection.from).toBe(1)
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeUndefined()
    expect(view.dom.querySelector('.rumi-link-icon[data-link-type="external"]')).toBeNull()

    view.destroy()
    host.remove()
  })

  it("keeps direct cursor placement after the leading globe on the anchor-editing side", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const linkMark = schema.marks.link!.create({ href: "https://example.com" })
    const marker = schema.nodes.link_marker!.create({
      href: "https://example.com",
      linkType: "external"
    })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        marker,
        schema.text("Example", [linkMark]),
        schema.text(" tail")
      ])
    )
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 14),
        plugins: [linkPlugin(schema)]
      })
    })

    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, 2))
        .setStoredMarks(null)
    )
    expect(schema.marks.link!.isInSet(view.state.storedMarks ?? [])).toBeDefined()

    view.dispatch(view.state.tr.insertText("!"))
    expect(view.state.doc.textContent).toBe("!Example tail")
    expect(view.state.doc.firstChild?.child(1).text).toBe("!Example")
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.child(1).marks))
      .toBeDefined()
    expect(view.state.doc.firstChild?.child(0).type.name).toBe("link_marker")

    view.destroy()
    host.remove()
  })

  it("unlinks while preserving anchor text when Backspace deletes only the link icon", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const linkMark = schema.marks.link!.create({ href: "https://example.com" })
    const marker = schema.nodes.link_marker!.create({
      href: "https://example.com",
      linkType: "external"
    })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        marker,
        schema.text("Example", [linkMark])
      ])
    )
    const plugin = linkPlugin(schema)
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1, 2),
        // Match the production ordering that previously let the base keymap
        // consume this selection before the link plugin could unlink it.
        plugins: [buildKeymap(schema), keymap(baseKeymap), plugin]
      })
    })
    const icon = view.dom.querySelector<HTMLElement>(".rumi-link-icon")!

    expect(icon.classList.contains("rumi-link-icon-selected")).toBe(true)
    const unlink = new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true
    })
    expect(view.dom.dispatchEvent(unlink)).toBe(false)
    expect(unlink.defaultPrevented).toBe(true)
    expect(view.state.doc.textContent).toBe("Example")
    expect(view.state.doc.firstChild?.firstChild?.isText).toBe(true)
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeUndefined()
    expect(view.state.selection.from).toBe(1)
    expect(view.dom.querySelector(".rumi-link-icon")).toBeNull()
    expect(serializeMarkdown(view.state.doc)).toBe("Example\n")

    view.destroy()
    host.remove()
  })

  it("treats a leading internal icon as an outside-to-anchor caret boundary", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const linkMark = schema.marks.link!.create({ href: "Notes.index.md" })
    const marker = schema.nodes.link_marker!.create({
      href: "Notes.index.md",
      linkType: "internal",
      mentionKind: "folder"
    })
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, [
        marker,
        schema.text("Notes", [linkMark]),
        schema.text(" tail")
      ])
    )
    const plugin = linkPlugin(schema)
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
        plugins: [plugin]
      })
    })
    const handleKeyDown = plugin.props.handleKeyDown!
    const icon = view.dom.querySelector<HTMLElement>('.rumi-link-icon[data-link-type="internal"]')!

    expect(icon).not.toBeNull()
    expect(icon.textContent).toBe("")
    expect(icon.dataset.linkKind).toBe("folder")
    expect(icon.closest("a")).toBeNull()
    expect(serializeMarkdown(view.state.doc)).toBe("[Notes](Notes.index.md) tail\n")

    expect(handleKeyDown.call(plugin, view, keyEvent("ArrowRight"))).toBe(true)
    expect(view.state.selection.from).toBe(2)
    expect(schema.marks.link!.isInSet(view.state.storedMarks ?? [])).toBeDefined()

    expect(handleKeyDown.call(plugin, view, keyEvent("ArrowLeft"))).toBe(true)
    expect(view.state.selection.from).toBe(1)
    expect(handleKeyDown.call(plugin, view, keyEvent("ArrowRight"))).toBe(true)
    expect(view.state.selection.from).toBe(2)
    expect(schema.marks.link!.isInSet(view.state.storedMarks ?? [])).toBeDefined()

    view.dispatch(view.state.tr.insertText("!"))
    expect(view.state.doc.textContent).toBe("!Notes tail")
    expect(view.state.doc.firstChild?.child(0).type.name).toBe("link_marker")
    expect(view.state.doc.firstChild?.child(0).attrs.linkType).toBe("internal")
    expect(view.state.doc.firstChild?.child(1).text).toBe("!Notes")
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.child(1).marks))
      .toBeDefined()

    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, 2))
        .setStoredMarks(null)
    )
    expect(schema.marks.link!.isInSet(view.state.storedMarks ?? [])).toBeDefined()
    expect(handleKeyDown.call(plugin, view, keyEvent("ArrowLeft"))).toBe(true)
    expect(view.state.selection.from).toBe(1)
    expect(schema.marks.link!.isInSet(view.state.storedMarks ?? [])).toBeUndefined()

    expect(handleKeyDown.call(plugin, view, keyEvent("ArrowRight"))).toBe(true)
    const unlink = keyEvent("Backspace")
    expect(handleKeyDown.call(plugin, view, unlink)).toBe(true)
    expect(view.state.selection.from).toBe(1)
    expect(view.state.doc.textContent).toBe("!Notes tail")
    expect(schema.marks.link!.isInSet(view.state.doc.firstChild!.firstChild!.marks))
      .toBeUndefined()
    expect(view.dom.querySelector('.rumi-link-icon[data-link-type="internal"]')).toBeNull()

    view.destroy()
    host.remove()
  })
})

function clickEvent(
  link: HTMLAnchorElement,
  overrides: Partial<MouseEvent> = {}
): MouseEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    button: 0,
    clientX: 0,
    clientY: 10,
    metaKey: false,
    target: link,
    preventDefault: vi.fn(),
    ...overrides
  } as unknown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> }
}

function keyEvent(
  key: string
): KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn()
  } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> }
}

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

function dispatchLinkIconClick(
  target: HTMLElement,
  overrides: MouseEventInit = {}
): void {
  for (const type of ["mousedown", "mouseup", "click"]) {
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...overrides
    }))
  }
}

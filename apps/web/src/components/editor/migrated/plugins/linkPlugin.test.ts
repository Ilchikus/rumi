// @vitest-environment jsdom
import { DOMSerializer } from "prosemirror-model"
import { EditorState, TextSelection, type Transaction } from "prosemirror-state"
import { describe, expect, it, vi } from "vitest"
import { EditorView } from "prosemirror-view"
import { linkClickIntent, linkPlugin } from "./linkPlugin"
import { selectionToolbarPlugin } from "./selectionToolbar"
import { schema } from "../schema"

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
    const doc = schema.nodes.doc!.create(
      null,
      schema.nodes.paragraph!.create(null, schema.text("Example", [linkMark]))
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
    )).toBe("current-tab")

    expect(linkClickIntent(link, clickEvent(link, { clientX: 95 })))
      .toBe("current-tab")
    handleClick.call(plugin, view, 3, clickEvent(link, { clientX: 95 }))
    expect(open).toHaveBeenLastCalledWith("https://example.com", "_self", undefined)
  })

  it("decorates only external anchors and normalizes www links for native browser actions", () => {
    const external = schema.marks.link!.create({ href: "www.example.com" })
    const internal = schema.marks.link!.create({ href: "Notes.md" })
    const paragraph = schema.nodes.paragraph!.create(null, [
      schema.text("External", [external]),
      schema.text(" and "),
      schema.text("Internal", [internal])
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

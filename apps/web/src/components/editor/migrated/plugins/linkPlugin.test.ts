// @vitest-environment jsdom
import { DOMSerializer } from "prosemirror-model"
import { EditorState, type Transaction } from "prosemirror-state"
import { describe, expect, it, vi } from "vitest"
import type { EditorView } from "prosemirror-view"
import { linkClickIntent, linkPlugin } from "./linkPlugin"
import { schema } from "../schema"

describe("link context menu interaction", () => {
  it("prevents secondary mousedown selection while leaving contextmenu native", () => {
    const plugin = linkPlugin(schema)
    const mouseDownHandler = plugin.props.handleDOMEvents?.mousedown
    const contextMenuHandler = plugin.props.handleDOMEvents?.contextmenu
    const preventDefault = vi.fn()
    const preventContextMenu = vi.fn()
    const classes = new Set<string>()
    const classList = {
      add: vi.fn((value: string) => classes.add(value)),
      remove: vi.fn((value: string) => classes.delete(value)),
      contains: vi.fn((value: string) => classes.has(value))
    }
    const editorContainer = { classList }
    const view = { dom: { closest: vi.fn(() => editorContainer) } } as unknown as EditorView
    const link = {}
    const target = { closest: vi.fn(() => link) }

    const handled = mouseDownHandler?.call(
      plugin,
      view,
      { button: 2, target, preventDefault } as unknown as MouseEvent
    )
    const contextHandled = contextMenuHandler?.call(
      plugin,
      view,
      { button: 2, target, preventDefault: preventContextMenu } as unknown as PointerEvent
    )
    const preventSelection = vi.fn()
    const textTarget = { parentElement: { closest: vi.fn(() => link) } }
    const selectionHandled = plugin.props.handleDOMEvents?.selectstart?.call(
      plugin,
      view,
      { target: textTarget, preventDefault: preventSelection } as unknown as Event
    )

    expect(handled).toBe(true)
    expect(contextHandled).toBe(false)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(preventContextMenu).not.toHaveBeenCalled()
    expect(selectionHandled).toBe(true)
    expect(preventSelection).toHaveBeenCalledOnce()
    expect(target.closest).toHaveBeenCalledWith("a")
    expect(classList.add).toHaveBeenCalledWith("rumi-native-context-link")
  })

  it("also treats macOS Control-click as native context-menu input", () => {
    const plugin = linkPlugin(schema)
    const handler = plugin.props.handleDOMEvents?.mousedown
    const preventControlClick = vi.fn()
    const editorContainer = { classList: { add: vi.fn(), remove: vi.fn() } }
    const view = { dom: { closest: () => editorContainer } } as unknown as EditorView
    const link = {}

    expect(handler?.call(
      plugin,
      view,
      { button: 0, ctrlKey: true, target: { closest: () => link }, preventDefault: preventControlClick } as unknown as MouseEvent
    )).toBe(true)
    expect(preventControlClick).toHaveBeenCalledOnce()
  })

  it("leaves ordinary primary clicks and secondary clicks outside links unchanged", () => {
    const plugin = linkPlugin(schema)
    const handler = plugin.props.handleDOMEvents?.mousedown
    const preventPrimary = vi.fn()
    const preventPlainText = vi.fn()

    expect(handler?.call(
      plugin,
      {} as EditorView,
      { button: 0, ctrlKey: false, target: { closest: () => ({}) }, preventDefault: preventPrimary } as unknown as MouseEvent
    )).toBe(false)
    expect(handler?.call(
      plugin,
      {} as EditorView,
      { button: 2, target: { closest: () => null }, preventDefault: preventPlainText } as unknown as MouseEvent
    )).toBe(false)
    expect(preventPrimary).not.toHaveBeenCalled()
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

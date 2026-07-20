import { describe, expect, it, vi } from "vitest"
import type { EditorView } from "prosemirror-view"
import { linkPlugin } from "./linkPlugin"
import { schema } from "../schema"

describe("link context menu interaction", () => {
  it("prevents secondary mousedown selection while leaving contextmenu native", () => {
    const plugin = linkPlugin(schema)
    const mouseDownHandler = plugin.props.handleDOMEvents?.mousedown
    const contextMenuHandler = plugin.props.handleDOMEvents?.contextmenu
    const preventDefault = vi.fn()
    const preventContextMenu = vi.fn()
    const classList = { add: vi.fn(), remove: vi.fn() }
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

    expect(handled).toBe(true)
    expect(contextHandled).toBe(false)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(preventContextMenu).not.toHaveBeenCalled()
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
})

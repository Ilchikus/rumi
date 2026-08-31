// @vitest-environment jsdom
import { EditorState, TextSelection } from "prosemirror-state"
import { DecorationSet, EditorView } from "prosemirror-view"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { schema } from "../schema"

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn()
}))

vi.mock("mermaid", () => ({
  default: mermaidMocks
}))

import { mermaidNodeView } from "./mermaidNodeView"
import { mermaidModePlugin } from "./mermaidMode"

interface PendingRender {
  code: string
  resolve: (value: { svg: string }) => void
  reject: (reason: Error) => void
}

describe("Mermaid node view", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark")
    mermaidMocks.initialize.mockReset()
    mermaidMocks.render.mockReset()
    mermaidMocks.render.mockResolvedValue({ svg: "<svg></svg>" })
  })

  it("suppresses Mermaid's document-level syntax error rendering", async () => {
    const node = schema.nodes.mermaid!.create(
      { mode: "view" },
      schema.text("not valid Mermaid")
    )
    const state = EditorState.create({
      doc: schema.nodes.doc!.create(null, node)
    })
    const view = { state, dispatch: vi.fn() } as unknown as EditorView
    const nodeView = mermaidNodeView(node, view, () => 0)

    await vi.waitFor(() => expect(mermaidMocks.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ suppressErrorRendering: true })
    ))

    nodeView.destroy?.()
  })

  it("re-renders open diagrams with Mermaid's matching application theme", async () => {
    const node = schema.nodes.mermaid!.create(
      { mode: "view" },
      schema.text("graph TD; A-->B")
    )
    const state = EditorState.create({
      doc: schema.nodes.doc!.create(null, node)
    })
    const view = { state, dispatch: vi.fn() } as unknown as EditorView
    const nodeView = mermaidNodeView(node, view, () => 0)

    await vi.waitFor(() => expect(mermaidMocks.render).toHaveBeenCalledTimes(1))
    expect(mermaidMocks.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "default" })
    )

    document.documentElement.classList.add("dark")
    window.dispatchEvent(new Event("rumi-theme-change"))

    await vi.waitFor(() => expect(mermaidMocks.render).toHaveBeenCalledTimes(2))
    expect(mermaidMocks.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "dark" })
    )

    nodeView.destroy?.()
  })

  it("defaults to view mode and exposes only the floating view/edit switcher", () => {
    const node = schema.nodes.mermaid!.create(
      null,
      schema.text("graph TD; A-->B")
    )
    const state = EditorState.create({
      doc: schema.nodes.doc!.create(null, node)
    })
    const dispatch = vi.fn()
    const focus = vi.fn()
    const view = { state, dispatch, focus } as unknown as EditorView
    const nodeView = mermaidNodeView(node, view, () => 0)
    const dom = nodeView.dom as HTMLElement

    expect(node.attrs.mode).toBe("view")
    expect(dom.classList.contains("bg-surface-subtle")).toBe(false)
    expect(dom.querySelector(".mermaid-label")).toBeNull()
    expect(dom.querySelectorAll(".mermaid-mode-btn")).toHaveLength(2)
    expect(dom.querySelector('[data-mode="split"]')).toBeNull()
    expect(dom.querySelector(".code-block-language-picker")).toBeNull()
    expect(dom.querySelector(".mermaid-editor")?.tagName).toBe("PRE")
    expect(dom.querySelector(".mermaid-textarea")?.tagName).toBe("CODE")
    expect(dom.querySelector(".mermaid-textarea")?.classList.contains("language-mermaid"))
      .toBe(true)
    expect(dom.querySelector<HTMLElement>(".mermaid-editor")?.style.display)
      .toBe("none")
    expect(dom.querySelector<HTMLElement>(".mermaid-preview")?.style.display)
      .toBe("flex")

    dom.querySelector<HTMLButtonElement>('[data-mode="edit"]')!.click()

    const transaction = dispatch.mock.calls[0]![0]
    expect(transaction.doc.firstChild?.attrs.mode).toBe("edit")
    expect(transaction.selection.$from.parentOffset).toBe(0)
    expect(focus).toHaveBeenCalled()
    expect(nodeView.update?.(
      transaction.doc.firstChild!,
      [],
      DecorationSet.empty
    )).toBe(true)
    expect(dom.classList.contains("bg-surface-subtle")).toBe(true)
    expect(dom.querySelector<HTMLElement>(".mermaid-editor")?.style.display)
      .toBe("flex")
    expect(dom.querySelector<HTMLElement>(".mermaid-preview")?.style.display)
      .toBe("none")

    nodeView.destroy?.()
  })

  it("re-enters edit with one toolbar click after its caret leaves", () => {
    const mermaid = schema.nodes.mermaid!.create(
      { mode: "view" },
      schema.text("flowchart TD\n  A --> B")
    )
    const paragraph = schema.nodes.paragraph!.create(null, schema.text("After"))
    const doc = schema.nodes.doc!.create(null, [mermaid, paragraph])
    const host = document.createElement("div")
    document.body.appendChild(host)
    const view = new EditorView(host, {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, mermaid.nodeSize + 1),
        plugins: [mermaidModePlugin()]
      }),
      nodeViews: {
        mermaid: (node, editorView, getPos) =>
          mermaidNodeView(node, editorView, getPos)
      }
    })
    // jsdom has no layout geometry for ProseMirror's scroll-to-selection path.
    Object.defineProperty(view, "scrollToSelection", {
      configurable: true,
      value: () => undefined
    })
    const wrapper = view.dom.querySelector<HTMLElement>(".mermaid-block-wrapper")!
    const editButton = wrapper.querySelector<HTMLButtonElement>('[data-mode="edit"]')!
    const viewButton = wrapper.querySelector<HTMLButtonElement>('[data-mode="view"]')!
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
      bottom: 248,
      height: 248,
      left: 0,
      right: 640,
      top: 0,
      width: 640,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })

    editButton.click()
    expect(view.state.doc.firstChild?.attrs.mode).toBe("edit")
    expect(view.state.selection.$from.parent.type.name).toBe("mermaid")
    expect(view.state.selection.$from.parentOffset).toBe(0)
    expect(wrapper.style.height).toBe("248px")

    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, mermaid.nodeSize + 1)
      )
    )
    expect(view.state.doc.firstChild?.attrs.mode).toBe("view")
    expect(wrapper.style.height).toBe("")
    expect(wrapper.querySelector<HTMLElement>(".mermaid-preview")?.style.display)
      .toBe("flex")

    editButton.click()
    expect(view.state.doc.firstChild?.attrs.mode).toBe("edit")
    expect(view.state.selection.$from.parent.type.name).toBe("mermaid")
    expect(wrapper.style.height).toBe("248px")
    expect(wrapper.querySelector<HTMLElement>(".mermaid-editor")?.style.display)
      .toBe("flex")

    viewButton.click()
    expect(view.state.doc.firstChild?.attrs.mode).toBe("view")
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph")
    expect(wrapper.style.height).toBe("")

    view.destroy()
    host.remove()
  })

  it("ignores an obsolete render failure after newer code succeeds", async () => {
    const pending: PendingRender[] = []
    mermaidMocks.render.mockImplementation((_id: string, code: string) => (
      new Promise<{ svg: string }>((resolve, reject) => {
        pending.push({ code, resolve, reject })
      })
    ))

    const firstNode = schema.nodes.mermaid!.create(
      { mode: "view" },
      schema.text("graph TD; A-->B")
    )
    const secondNode = schema.nodes.mermaid!.create(
      { mode: "view" },
      schema.text("graph TD; A-->C")
    )
    const state = EditorState.create({
      doc: schema.nodes.doc!.create(null, firstNode)
    })
    const view = { state, dispatch: vi.fn() } as unknown as EditorView
    const nodeView = mermaidNodeView(firstNode, view, () => 0)

    await vi.waitFor(() => expect(pending).toHaveLength(1))
    expect(nodeView.update?.(secondNode, [], DecorationSet.empty)).toBe(true)
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    expect(pending.map(({ code }) => code)).toEqual([
      "graph TD; A-->B",
      "graph TD; A-->C"
    ])
    expect(mermaidMocks.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        suppressErrorRendering: true
      })
    )

    pending[1]!.resolve({ svg: "<svg data-current=\"true\"></svg>" })
    await Promise.resolve()
    pending[0]!.reject(new Error("obsolete error"))
    await Promise.resolve()

    const dom = nodeView.dom as HTMLElement
    expect(dom.querySelector(".mermaid-diagram svg")?.getAttribute("data-current"))
      .toBe("true")
    expect(dom.querySelector<HTMLElement>(".mermaid-error")?.style.display)
      .toBe("none")

    nodeView.destroy?.()
  })
})

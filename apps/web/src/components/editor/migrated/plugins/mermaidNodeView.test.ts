// @vitest-environment jsdom
import { EditorState } from "prosemirror-state"
import { DecorationSet, type EditorView } from "prosemirror-view"
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

interface PendingRender {
  code: string
  resolve: (value: { svg: string }) => void
  reject: (reason: Error) => void
}

describe("Mermaid node view", () => {
  beforeEach(() => {
    mermaidMocks.render.mockReset()
  })

  it("ignores an obsolete render failure after newer code succeeds", async () => {
    const pending: PendingRender[] = []
    mermaidMocks.render.mockImplementation((_id: string, code: string) => (
      new Promise<{ svg: string }>((resolve, reject) => {
        pending.push({ code, resolve, reject })
      })
    ))

    const firstNode = schema.nodes.mermaid!.create(
      { mode: "split" },
      schema.text("graph TD; A-->B")
    )
    const secondNode = schema.nodes.mermaid!.create(
      { mode: "split" },
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
      expect.objectContaining({ securityLevel: "strict" })
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

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { EditorView } from "prosemirror-view"
import { EditorState } from "prosemirror-state"
import type { PageDocument } from "@rumi/contracts"
import type { RumiApiClient } from "@rumi/api-client"
import { parseMarkdown } from "../markdown"
import { schema } from "../schema"
import { setMigratedEditorPlatform, type MigratedEditorPlatform } from "../platform"
import { internalLinkPreviewPlugin, pagePreviewExcerpt, previewDocumentPath } from "./internalLinkPreview"

const platform: MigratedEditorPlatform = {
  workspaceKey: "workspace", documentKey: "Notes/Start.md", databaseRefreshRevisions: {},
  documents: [
    { path: "Notes/Target.md", nodePath: "Notes/Target.md", title: "Target", kind: "page" },
    { path: "Target.md", nodePath: "Target.md", title: "Root target", kind: "page" }
  ]
}
const views: EditorView[] = []
afterEach(() => { views.forEach((view) => view.destroy()); views.length = 0; document.body.replaceChildren(); vi.useRealTimers(); setMigratedEditorPlatform({ ...platform, api: undefined }) })

it("resolves relative, root, and same-page links while excluding external destinations", () => {
  expect(previewDocumentPath("Target.md#section", platform)).toBe("Notes/Target.md")
  expect(previewDocumentPath("/Target.md", platform)).toBe("Target.md")
  expect(previewDocumentPath("#section", platform)).toBe("Notes/Start.md")
  expect(previewDocumentPath("https://example.com", platform)).toBeNull()
  expect(previewDocumentPath("//example.com", platform)).toBeNull()
})
it("shows a plain excerpt with Markdown formatting removed", () => {
  expect(pagePreviewExcerpt("# Title\n\n**Bold** [label](Target.md)\nnext line")).toBe("Title Bold label next line")
})
it("waits for hover, renders title/properties/content safely and discards obsolete responses", async () => {
  vi.useFakeTimers()
  let resolve!: (page: PageDocument) => void
  const openPage = vi.fn(() => new Promise<PageDocument>((done) => { resolve = done }))
  setMigratedEditorPlatform({ ...platform, api: { openPage } as unknown as RumiApiClient })
  const host = document.createElement("div"); document.body.append(host)
  const view = new EditorView(host, { state: EditorState.create({ doc: parseMarkdown("[Read](Target.md)", schema), plugins: [internalLinkPreviewPlugin()] }) })
  views.push(view)
  const link = view.dom.querySelector("a")!
  link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  await vi.advanceTimersByTimeAsync(399)
  expect(openPage).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(openPage).toHaveBeenCalledWith("Notes/Target.md")
  resolve({ path: "Notes/Target.md", frontmatter: { title: "<script>Title</script>", status: "Ready" }, markdownBody: "**Excerpt** body" } as unknown as PageDocument)
  await Promise.resolve()
  const card = document.querySelector<HTMLElement>(".rumi-link-preview")!
  expect(card.hidden).toBe(false)
  expect(card.textContent).toContain("<script>Title</script>")
  expect(card.querySelector("script")).toBeNull()
  expect(card.textContent).toContain("statusReady")
  expect(card.textContent).toContain("Excerpt body")
  expect(link.getAttribute("aria-describedby")).toBe(card.id)
  view.dom.dispatchEvent(new MouseEvent("mouseleave"))
  expect(card.hidden).toBe(true)
  link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  await vi.advanceTimersByTimeAsync(400)
  view.dom.dispatchEvent(new MouseEvent("mouseleave"))
  resolve({ path: "Notes/Target.md", frontmatter: {}, markdownBody: "Stale" } as unknown as PageDocument)
  await Promise.resolve()
  expect(card.hidden).toBe(true)
})

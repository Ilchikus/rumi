import type { Node as PmNode } from "prosemirror-model"
import { Plugin, TextSelection } from "prosemirror-state"
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view"
import { collapsibleHeadingsKey, findSectionEnd } from "./collapsibleHeadings"

export const HEADING_NAVIGATION_EVENT = "rumi:heading-navigation"
export interface OutlineHeading { id: string; title: string; level: number; pos: number }

export function documentHeadings(doc: PmNode): OutlineHeading[] {
  const used = new Set<string>()
  const headings: OutlineHeading[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return
    const title = node.textContent.trim()
    const base = title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\s-]/gu, "").replace(/\s/g, "-") || "section"
    let id = base
    let suffix = 0
    while (used.has(id)) id = `${base}-${++suffix}`
    used.add(id)
    headings.push({ id, title: title || "Untitled heading", level: node.attrs.level, pos })
  })
  return headings
}

export function navigateToHeading(view: EditorView, fragment: string): boolean {
  let id: string
  try { id = decodeURIComponent(fragment.replace(/^#/, "")) } catch { return false }
  const heading = documentHeadings(view.state.doc).find((item) => item.id === id)
  if (!heading) return false
  let tr = view.state.tr
  const collapsed = new Set(collapsibleHeadingsKey.getState(view.state)?.collapsed ?? [])
  for (const pos of collapsed) {
    const node = view.state.doc.nodeAt(pos)
    if (node && pos <= heading.pos && findSectionEnd(view.state.doc, pos, node.attrs.level) > heading.pos) collapsed.delete(pos)
  }
  tr = tr.setMeta(collapsibleHeadingsKey, { collapsed })
    .setSelection(TextSelection.create(tr.doc, heading.pos + 1))
    .setMeta("addToHistory", false)
  view.dispatch(tr)
  const dom = view.nodeDOM(heading.pos)
  if (dom instanceof HTMLElement) dom.scrollIntoView?.({ block: "start" })
  return true
}

export function documentOutlinePlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        return DecorationSet.create(state.doc, documentHeadings(state.doc).map((heading) =>
          Decoration.node(heading.pos, heading.pos + state.doc.nodeAt(heading.pos)!.nodeSize, { id: heading.id, "data-heading-anchor": heading.id })
        ))
      }
    },
    view(view) {
      const nav = document.createElement("nav")
      nav.className = "rumi-document-outline"
      nav.setAttribute("aria-label", "Table of contents")
      const details = document.createElement("details")
      details.open = true
      const summary = document.createElement("summary")
      summary.textContent = "On this page"
      const list = document.createElement("ol")
      details.append(summary, list)
      nav.append(details)
      view.dom.closest(".prosemirror-editor-wrapper")?.append(nav)
      let previous = ""
      const render = () => {
        const headings = documentHeadings(view.state.doc)
        const signature = JSON.stringify(headings)
        if (signature === previous) return
        previous = signature
        nav.hidden = headings.length === 0
        list.replaceChildren()
        for (const heading of headings) {
          const item = document.createElement("li")
          const link = document.createElement("a")
          link.href = `#${encodeURIComponent(heading.id)}`
          link.textContent = heading.title
          link.style.paddingLeft = `${(heading.level - 1) * 12}px`
          link.addEventListener("click", (event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            window.history.pushState(window.history.state, "", link.hash)
            navigateToHeading(view, link.hash)
          })
          item.append(link)
          list.append(item)
        }
      }
      let frame: number | null = null
      const navigate = () => {
        if (frame !== null) cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            frame = null
            if (window.location.hash) navigateToHeading(view, window.location.hash)
          })
        })
      }
      render()
      navigate()
      window.addEventListener("hashchange", navigate)
      window.addEventListener("popstate", navigate)
      window.addEventListener(HEADING_NAVIGATION_EVENT, navigate)
      return {
        update() { render() },
        destroy() {
          if (frame !== null) cancelAnimationFrame(frame)
          window.removeEventListener("hashchange", navigate)
          window.removeEventListener("popstate", navigate)
          window.removeEventListener(HEADING_NAVIGATION_EVENT, navigate)
          nav.remove()
        }
      }
    }
  })
}

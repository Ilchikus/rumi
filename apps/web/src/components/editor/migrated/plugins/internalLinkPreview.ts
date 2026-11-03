import type { PageDocument, WorkspaceNode } from "@rumi/contracts"
import { Plugin } from "prosemirror-state"
import { resolveWorkspaceDocumentLink } from "../../../../lib/workspaceDocumentLink"
import { migratedEditorPlatform, type MigratedEditorPlatform } from "../platform"
import { parseMarkdown } from "../markdown"
import { schema } from "../schema"

export function previewDocumentPath(href: string, platform: MigratedEditorPlatform): string | null {
  if (href.startsWith("#")) return platform.documentKey
  const home = platform.documents.find((document) => document.kind === "workspace")
  const tree: WorkspaceNode = {
    name: home?.title ?? "Workspace", path: "", kind: "workspace",
    ...(home ? { companionPath: home.path } : {}),
    children: platform.documents.filter((document) => document.kind !== "workspace").map((document) => ({
      path: document.nodePath, name: document.title, kind: document.kind,
      companionPath: document.path
    }))
  }
  const node = resolveWorkspaceDocumentLink(tree, href, platform.documentKey)
  return node?.companionPath ?? (node?.kind === "page" ? node.path : null)
}

export function pagePreviewExcerpt(markdown: string): string {
  const doc = parseMarkdown(markdown.slice(0, 20000), schema)
  return doc.textBetween(0, doc.content.size, " ").replace(/\s+/g, " ").trim().slice(0, 280)
}

export function internalLinkPreviewPlugin(): Plugin {
  return new Plugin({
    view(view) {
      const card = document.createElement("aside")
      card.className = "rumi-link-preview"
      card.setAttribute("role", "tooltip")
      card.id = `rumi-page-preview-${Math.random().toString(36).slice(2)}`
      card.hidden = true
      document.body.append(card)
      let timer: ReturnType<typeof setTimeout> | null = null
      let revision = 0
      let hovered: HTMLElement | null = null
      let contentVersion = view.state.doc
      const hide = () => {
        revision++
        if (timer) clearTimeout(timer)
        timer = null
        hovered?.removeAttribute("aria-describedby")
        hovered = null
        card.hidden = true
      }
      const render = (page: PageDocument, title: string) => {
        card.replaceChildren()
        const heading = document.createElement("strong")
        heading.textContent = typeof page.frontmatter.title === "string" ? page.frontmatter.title : title
        card.append(heading)
        const properties = Object.entries(page.frontmatter).filter(([key]) => key !== "icon" && key !== "title" && key !== "type" && key !== "properties" && key !== "views").slice(0, 5)
        if (properties.length) {
          const list = document.createElement("dl")
          for (const [key, value] of properties) {
            const name = document.createElement("dt")
            const text = document.createElement("dd")
            name.textContent = key
            text.textContent = (Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "")).slice(0, 120)
            list.append(name, text)
          }
          card.append(list)
        }
        const excerpt = document.createElement("p")
        excerpt.textContent = pagePreviewExcerpt(page.markdownBody) || "Empty page"
        card.append(excerpt)
      }
      const hover = (event: Event) => {
        const element = event.target instanceof Element ? event.target.closest<HTMLElement>("a[href], [data-rumi-link-icon]") : null
        if (element === hovered) return
        hide()
        if (!element) return
        const href = element.getAttribute("href") ?? element.dataset.href ?? ""
        const platform = migratedEditorPlatform()
        const path = previewDocumentPath(href, platform)
        if (!path || !platform.api) return
        hovered = element
        const request = revision
        timer = setTimeout(() => {
          timer = null
          void platform.api!.openPage(path).then((page) => {
            if (request !== revision || !element.isConnected) return
            const title = platform.documents.find((document) => document.path === path)?.title ?? path.split("/").at(-1)!.replace(/\.md$/, "")
            render(page, title)
            const rect = element.getBoundingClientRect()
            card.hidden = false
            card.style.left = `${Math.max(8, Math.min(window.innerWidth - card.offsetWidth - 8, rect.left))}px`
            card.style.top = `${Math.max(8, Math.min(window.innerHeight - card.offsetHeight - 8, rect.bottom + 8))}px`
            element.setAttribute("aria-describedby", card.id)
          }).catch(() => { if (request === revision) hide() })
        }, 400)
      }
      const leave = () => hide()
      const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") hide() }
      view.dom.addEventListener("mouseover", hover)
      view.dom.addEventListener("focusin", hover)
      view.dom.addEventListener("mouseleave", leave)
      view.dom.addEventListener("focusout", leave)
      view.dom.addEventListener("pointerdown", leave)
      view.dom.addEventListener("keydown", keydown)
      window.addEventListener("scroll", leave, true)
      return {
        update() { if (view.state.doc !== contentVersion) { contentVersion = view.state.doc; hide() } },
        destroy() {
          hide()
          view.dom.removeEventListener("mouseover", hover)
          view.dom.removeEventListener("focusin", hover)
          view.dom.removeEventListener("mouseleave", leave)
          view.dom.removeEventListener("focusout", leave)
          view.dom.removeEventListener("pointerdown", leave)
          view.dom.removeEventListener("keydown", keydown)
          window.removeEventListener("scroll", leave, true)
          card.remove()
        }
      }
    }
  })
}

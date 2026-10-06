import { DOMSerializer, type Node as ProseMirrorNode } from "prosemirror-model"
import type { NodeView } from "prosemirror-view"
import { loadPhosphorCatalog } from "../../../icons/phosphorCatalog"
import {
  parseWorkspaceIcon,
  subscribeWorkspaceIcons,
  workspaceIconAssetUrl,
  workspaceIconForLink
} from "../../../../lib/workspaceIcons"
import { migratedEditorPlatform } from "../platform"

/**
 * Renders the link marker exactly as its schema does. For a mention, the
 * target item's custom icon replaces the page, folder, or database glyph;
 * other internal links keep the glyph. The icon is resolved at render time,
 * so Markdown never stores it.
 */
export function linkMarkerNodeView(initialNode: ProseMirrorNode): NodeView {
  const spec = initialNode.type.spec.toDOM!(initialNode)
  const dom = DOMSerializer.renderSpec(document, spec).dom as HTMLElement
  let node = initialNode
  let renderId = 0

  const render = () => {
    const id = ++renderId
    const icon = node.attrs.linkType === "internal" && node.attrs.mention
      ? workspaceIconForLink(node.attrs.href, migratedEditorPlatform().documentKey)
      : undefined
    const parsed = parseWorkspaceIcon(icon)

    if (parsed?.type !== "phosphor") {
      applyLinkMarkerIcon(dom, parsed?.type === "emoji"
        ? { type: "emoji", emoji: parsed.emoji }
        : parsed?.type === "asset"
          ? { type: "asset", url: workspaceIconAssetUrl(parsed) }
          : null)
      return
    }

    void loadPhosphorCatalog().then((catalog) => {
      if (id !== renderId) return
      const path = catalog.byName.get(parsed.name)?.path
      applyLinkMarkerIcon(dom, path ? { type: "phosphor", path } : null)
    }, () => undefined)
  }

  render()
  // Only mentions can show a custom icon, and a change to the mention flag
  // recreates this view, so other links never need icon updates.
  const showsCustomIcon = node.attrs.linkType === "internal" && node.attrs.mention
  const unsubscribe = showsCustomIcon ? subscribeWorkspaceIcons(render) : () => undefined

  return {
    dom,
    update(nextNode) {
      if (
        nextNode.type !== node.type ||
        nextNode.attrs.href !== node.attrs.href ||
        nextNode.attrs.linkType !== node.attrs.linkType ||
        nextNode.attrs.mentionKind !== node.attrs.mentionKind ||
        nextNode.attrs.mention !== node.attrs.mention
      ) return false
      node = nextNode
      return true
    },
    ignoreMutation: () => true,
    destroy() {
      renderId += 1
      unsubscribe()
    }
  }
}

type LinkMarkerIcon =
  | { type: "emoji"; emoji: string }
  | { type: "asset"; url: string }
  | { type: "phosphor"; path: string }

export function applyLinkMarkerIcon(dom: HTMLElement, icon: LinkMarkerIcon | null): void {
  dom.style.removeProperty("--rumi-link-icon")
  dom.style.removeProperty("--rumi-link-icon-image")
  dom.removeAttribute("data-icon-emoji")

  if (!icon) {
    dom.removeAttribute("data-custom-icon")
    return
  }

  dom.setAttribute("data-custom-icon", icon.type)
  if (icon.type === "emoji") {
    dom.setAttribute("data-icon-emoji", icon.emoji)
  } else if (icon.type === "asset") {
    dom.style.setProperty("--rumi-link-icon-image", `url(${JSON.stringify(icon.url)})`)
  } else {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'><path d='${icon.path}'/></svg>`
    dom.style.setProperty("--rumi-link-icon", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
  }
}

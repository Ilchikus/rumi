import { DOMSerializer, type Node as ProseMirrorNode } from "prosemirror-model"
import type { NodeView } from "prosemirror-view"
import {
  loadDrawableWorkspaceIcon,
  type DrawableWorkspaceIcon
} from "../../../icons/drawableIcon"
import { subscribeWorkspaceIcons, workspaceIconForLink } from "../../../../lib/workspaceIcons"
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
    const icon = workspaceIconForLink(node.attrs.href, migratedEditorPlatform().documentKey)
    void loadDrawableWorkspaceIcon(icon).then((drawable) => {
      if (id === renderId) applyLinkMarkerIcon(dom, drawable)
    }, () => undefined)
  }

  // Only mentions show a custom icon. Changing the link or its mention flag
  // recreates this view, so other links never render or subscribe.
  const showsCustomIcon = node.attrs.linkType === "internal" && node.attrs.mention
  if (showsCustomIcon) render()
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

export function applyLinkMarkerIcon(dom: HTMLElement, icon: DrawableWorkspaceIcon | null): void {
  dom.style.removeProperty("--rumi-link-icon")
  dom.style.removeProperty("--rumi-link-icon-color")
  dom.style.removeProperty("--rumi-link-icon-image")
  dom.removeAttribute("data-icon-emoji")

  if (!icon) {
    dom.removeAttribute("data-custom-icon")
    return
  }

  if (icon.type === "emoji") {
    dom.setAttribute("data-custom-icon", "emoji")
    dom.setAttribute("data-icon-emoji", icon.emoji)
  } else if (icon.type === "image") {
    dom.setAttribute("data-custom-icon", "asset")
    dom.style.setProperty("--rumi-link-icon-image", `url(${JSON.stringify(icon.url)})`)
  } else {
    // The glyph draws through the existing link-icon mask, in the link color
    // unless the icon has its own.
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'><path d='${icon.path}'/></svg>`
    dom.setAttribute("data-custom-icon", "phosphor")
    dom.style.setProperty("--rumi-link-icon", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
    if (icon.color) dom.style.setProperty("--rumi-link-icon-color", icon.color)
  }
}

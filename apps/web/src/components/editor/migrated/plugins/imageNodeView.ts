// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Node as PmNode } from "prosemirror-model"
import { EditorView, NodeView } from "prosemirror-view"
import { workspaceAssetUrl } from "../platform"

const ALIGN_LEFT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm8,48H168a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm176,24H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm-48,40H40a8,8,0,0,0,0,16H168a8,8,0,0,0,0-16Z"></path></svg>`
const ALIGN_CENTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm32,32a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16Zm152,40H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm-24,40H64a8,8,0,0,0,0,16H192a8,8,0,0,0,0-16Z"></path></svg>`
const ALIGN_FULL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M32,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H40A8,8,0,0,1,32,64Zm8,48H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm176,24H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,40H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"></path></svg>`

const DIRECT_SRC_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:/u

export function imageNodeView(
  node: PmNode,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  let currentSrc = node.attrs.src as string

  const loadImage = (src: string) => {
    const trimmed = src.trim()
    currentSrc = src

    if (!trimmed) {
      img.removeAttribute("src")
      return
    }

    img.src = DIRECT_SRC_REGEX.test(trimmed) || trimmed.startsWith("//")
      ? trimmed
      : workspaceAssetUrl(trimmed)
  }

  // Main container
  const dom = document.createElement("figure")
  dom.className = "image-block"
  dom.setAttribute("data-alignment", node.attrs.alignment || "center")

  // Image wrapper for positioning
  const wrapper = document.createElement("div")
  wrapper.className = "image-wrapper"
  dom.appendChild(wrapper)

  // Image element
  const img = document.createElement("img")
  img.alt = node.attrs.alt || ""
  if (node.attrs.title) img.title = node.attrs.title
  img.draggable = false
  wrapper.appendChild(img)
  loadImage(node.attrs.src)

  // Toolbar (alignment controls)
  const toolbar = document.createElement("div")
  toolbar.className = "image-toolbar"
  toolbar.contentEditable = "false"

  const alignments: Array<{ value: string; icon: string; title: string }> = [
    { value: "left", icon: ALIGN_LEFT_SVG, title: "Align left" },
    { value: "center", icon: ALIGN_CENTER_SVG, title: "Center" },
    { value: "full", icon: ALIGN_FULL_SVG, title: "Full width" },
  ]

  alignments.forEach(({ value, icon, title }) => {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "image-align-btn"
    btn.title = title
    btn.innerHTML = icon
    if (node.attrs.alignment === value) {
      btn.classList.add("active")
    }
    btn.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = getPos()
      if (pos === undefined) return
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          alignment: value,
        })
      )
    })
    toolbar.appendChild(btn)
  })

  wrapper.appendChild(toolbar)

  // Caption (editable figcaption)
  const caption = document.createElement("figcaption")
  caption.className = "image-caption"
  caption.contentEditable = "true"
  caption.textContent = node.attrs.caption || ""
  caption.setAttribute("placeholder", "Add a caption...")

  caption.addEventListener("input", () => {
    const pos = getPos()
    if (pos === undefined) return
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        caption: caption.textContent || "",
      })
    )
  })

  // Prevent ProseMirror from handling keyboard events in caption
  caption.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      // Move focus to editor after caption
      const pos = getPos()
      if (pos !== undefined) {
        const nodeSize = view.state.doc.nodeAt(pos)?.nodeSize || 0
        const endPos = pos + nodeSize
        view.focus()
        view.dispatch(
          view.state.tr.setSelection(
            view.state.selection.constructor.near(
              view.state.doc.resolve(endPos)
            )
          )
        )
      }
    }
    e.stopPropagation()
  })

  dom.appendChild(caption)

  return {
    dom,
    stopEvent(event) {
      // Let caption handle its own events
      if (caption.contains(event.target as Node)) {
        return true
      }
      // Let toolbar handle clicks
      if (toolbar.contains(event.target as Node)) {
        return true
      }
      return false
    },
    ignoreMutation(mutation) {
      // Ignore mutations in caption (it's contenteditable)
      if (caption.contains(mutation.target)) {
        return true
      }
      return false
    },
    update(updatedNode) {
      if (updatedNode.type.name !== "image") return false

      // Update alignment
      dom.setAttribute("data-alignment", updatedNode.attrs.alignment || "center")

      // Update image
      if (updatedNode.attrs.src !== currentSrc) {
        loadImage(updatedNode.attrs.src)
      }
      img.alt = updatedNode.attrs.alt || ""
      if (updatedNode.attrs.title) {
        img.title = updatedNode.attrs.title
      } else {
        img.removeAttribute("title")
      }

      // Update toolbar active state
      toolbar.querySelectorAll(".image-align-btn").forEach((btn, i) => {
        btn.classList.toggle("active", alignments[i].value === updatedNode.attrs.alignment)
      })

      // Update caption (only if different to avoid cursor jumping)
      if (caption.textContent !== updatedNode.attrs.caption && document.activeElement !== caption) {
        caption.textContent = updatedNode.attrs.caption || ""
      }

      return true
    },
  }
}

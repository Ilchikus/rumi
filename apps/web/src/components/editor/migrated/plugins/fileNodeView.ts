// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Node as PmNode } from "prosemirror-model"
import { EditorView, NodeView } from "prosemirror-view"
import { workspaceAssetUrl } from "../platform"

const FILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M213.66,82.34l-44-44A8,8,0,0,0,164,36H72A20,20,0,0,0,52,56V200a20,20,0,0,0,20,20H184a20,20,0,0,0,20-20V88A8,8,0,0,0,213.66,82.34ZM172,63.31,188.69,80H172ZM188,200a4,4,0,0,1-4,4H72a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4h84V88a8,8,0,0,0,8,8h24Z"></path></svg>`
const OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M216,104v96a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40h96a8,8,0,0,1,0,16H56V200H200V104a8,8,0,0,1,16,0Zm-35.31-69.66-64,64a8,8,0,0,0,11.31,11.32L192,45.66V80a8,8,0,0,0,16,0V26.34A8,8,0,0,0,200,18.34H146a8,8,0,0,0,0,16h34.34Z"></path></svg>`

function getFileName(src: string): string {
  const normalized = src.replace(/\\/g, "/")
  return normalized.split("/").pop() || src
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".")
  return dotIndex === -1 ? "" : fileName.slice(dotIndex + 1).toLowerCase()
}

export function fileNodeView(
  node: PmNode,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  let loadVersion = 0
  let currentSrc = node.attrs.src as string
  let currentAssetUrl = ""

  const dom = document.createElement("figure")
  dom.className = "file-block"

  const card = document.createElement("div")
  card.className = "file-card"
  dom.appendChild(card)

  const header = document.createElement("div")
  header.className = "file-card-header"
  card.appendChild(header)

  const info = document.createElement("div")
  info.className = "file-card-info"
  header.appendChild(info)

  const titleRow = document.createElement("div")
  titleRow.className = "file-card-title-row"
  info.appendChild(titleRow)

  const icon = document.createElement("span")
  icon.className = "file-card-icon"
  icon.innerHTML = FILE_SVG
  titleRow.appendChild(icon)

  const title = document.createElement("span")
  title.className = "file-card-title"
  titleRow.appendChild(title)

  const meta = document.createElement("div")
  meta.className = "file-card-meta"
  info.appendChild(meta)

  const openButton = document.createElement("button")
  openButton.type = "button"
  openButton.className = "file-open-btn"
  openButton.contentEditable = "false"
  openButton.innerHTML = `${OPEN_SVG}<span>Open</span>`
  openButton.disabled = true
  header.appendChild(openButton)

  const preview = document.createElement("div")
  preview.className = "file-preview"
  card.appendChild(preview)

  const previewImage = document.createElement("img")
  previewImage.className = "file-preview-image"
  previewImage.alt = ""
  previewImage.hidden = true
  preview.appendChild(previewImage)

  const placeholder = document.createElement("div")
  placeholder.className = "file-preview-empty"
  preview.appendChild(placeholder)

  const setPlaceholder = (message: string) => {
    placeholder.textContent = message
    placeholder.hidden = false
    previewImage.hidden = true
  }

  const setTitle = (src: string) => {
    title.textContent = getFileName(src) || "File"
  }

  const loadPreview = async (src: string) => {
    const requestVersion = ++loadVersion
    currentSrc = src
    currentAssetUrl = ""
    openButton.disabled = true
    setTitle(src)
    meta.textContent = "Loading preview..."
    setPlaceholder("Loading PDF preview...")

    const trimmed = src.trim()
    if (!trimmed) {
      meta.textContent = "No file selected"
      setPlaceholder("No file selected")
      return
    }

    if (requestVersion !== loadVersion) return
    currentAssetUrl = workspaceAssetUrl(trimmed)
    openButton.disabled = false
    const fileName = getFileName(trimmed)
    title.textContent = fileName
    const extension = getFileExtension(fileName)
    meta.textContent = extension.toUpperCase() || "FILE"
    setPlaceholder(extension === "pdf" ? "PDF attachment" : "File attachment")
  }

  openButton.addEventListener("click", async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!currentAssetUrl) return
    window.open(currentAssetUrl, "_blank", "noopener,noreferrer")
  })

  void loadPreview(node.attrs.src)

  return {
    dom,
    stopEvent(event) {
      return openButton.contains(event.target as Node)
    },
    ignoreMutation() {
      return true
    },
    update(updatedNode) {
      if (updatedNode.type.name !== "file_embed") return false

      if (updatedNode.attrs.src !== currentSrc) {
        void loadPreview(updatedNode.attrs.src)
      }

      return true
    },
    destroy() {
      loadVersion += 1
    },
  }
}

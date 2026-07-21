// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema } from "prosemirror-model"
import { searchMentionItems } from "../mentionSearch"
import {
  renderedMentionKind,
  type MentionItemKind
} from "../mentionTypes"

export { mentionKindForPath } from "../mentionTypes"

export const atMentionPluginKey = new PluginKey("atMention")

export interface FileItem {
  name: string
  path: string
  kind?: MentionItemKind
}

const MENTION_ICONS: Record<"folder" | "database" | "page", string> = {
  folder: `<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM92.69,56l16,16H40V56ZM216,200H40V88H216Z"/></svg>`,
  database: `<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM40,112H80v32H40Zm56,0H216v32H96ZM216,64V96H40V64ZM40,160H80v32H40Zm176,32H96V160H216v32Z"/></svg>`,
  page: `<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z"/></svg>`
}

interface PluginState {
  active: boolean
  query: string
  range: { from: number; to: number } | null
  selectedIndex: number
}

export function atMentionPlugin(schema: Schema, getFiles: () => FileItem[]) {
  if (!schema.marks.link) return new Plugin({ key: atMentionPluginKey })

  return new Plugin<PluginState>({
    key: atMentionPluginKey,

    state: {
      init(): PluginState {
        return {
          active: false,
          query: "",
          range: null,
          selectedIndex: 0
        }
      },

      apply(tr, state): PluginState {
        const meta = tr.getMeta(atMentionPluginKey)
        if (meta) {
          return { ...state, ...meta }
        }

        if (!state.active) return state

        // Check if selection has moved away from the @
        const { selection } = tr
        if (state.range && selection.from < state.range.from) {
          return { active: false, query: "", range: null, selectedIndex: 0 }
        }

        return state
      }
    },

    props: {
      handleDOMEvents: {
        keydown(view, event) {
          const state = atMentionPluginKey.getState(view.state)

          if (!state?.active) {
            return false
          }

          // Handle navigation when menu is active
          const files = filterFiles(getFiles(), state.query)

          if (event.key === "ArrowDown") {
            event.preventDefault()
            event.stopPropagation()
            const newIndex = Math.min(state.selectedIndex + 1, Math.max(0, files.length - 1))
            const tr = view.state.tr.setMeta(atMentionPluginKey, { selectedIndex: newIndex })
            view.dispatch(tr)
            return true
          }

          if (event.key === "ArrowUp") {
            event.preventDefault()
            event.stopPropagation()
            const newIndex = Math.max(state.selectedIndex - 1, 0)
            const tr = view.state.tr.setMeta(atMentionPluginKey, { selectedIndex: newIndex })
            view.dispatch(tr)
            return true
          }

          if (event.key === "Enter") {
            event.preventDefault()
            event.stopPropagation()
            const file = files[state.selectedIndex]
            if (file && state.range) {
              insertFileLink(view, file, state.range, schema)
            }
            return true
          }

          if (event.key === "Tab") {
            event.preventDefault()
            event.stopPropagation()
            const file = files[state.selectedIndex]
            if (file && state.range) {
              insertFileLink(view, file, state.range, schema)
            }
            return true
          }

          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            const tr = view.state.tr.setMeta(atMentionPluginKey, {
              active: false,
              query: "",
              range: null,
              selectedIndex: 0
            })
            view.dispatch(tr)
            return true
          }

          if (event.key === "Backspace" && state.range) {
            const { $from } = view.state.selection
            if ($from.pos <= state.range.from + 1) {
              // Deactivate if backspacing past the @
              const tr = view.state.tr.setMeta(atMentionPluginKey, {
                active: false,
                query: "",
                range: null,
                selectedIndex: 0
              })
              view.dispatch(tr)
              return false
            }
          }

          return false
        }
      },

      handleKeyDown(view, event) {
        const state = atMentionPluginKey.getState(view.state)

        if (!state?.active) {
          // Check for @ trigger
          if (event.key === "@") {
            const { $from } = view.state.selection
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "\ufffc")
            const isValidPosition = textBefore.length === 0 || textBefore.endsWith(" ") || textBefore.endsWith("\n")

            if (isValidPosition) {
              // Activate after @ is inserted
              setTimeout(() => {
                const tr = view.state.tr.setMeta(atMentionPluginKey, {
                  active: true,
                  query: "",
                  range: { from: view.state.selection.from - 1, to: view.state.selection.from },
                  selectedIndex: 0
                })
                view.dispatch(tr)
              }, 0)
            }
          }
        }

        return false
      },

      handleTextInput(view, from, to, text) {
        const state = atMentionPluginKey.getState(view.state)
        if (!state?.active) return false

        // Update query after text is inserted
        setTimeout(() => {
          const pluginState = atMentionPluginKey.getState(view.state)
          if (!pluginState?.active || !pluginState.range) return

          const { $from } = view.state.selection
          const query = $from.parent.textBetween(
            pluginState.range.from - $from.start() + 1,
            $from.parentOffset,
            null,
            "\ufffc"
          )

          const tr = view.state.tr.setMeta(atMentionPluginKey, {
            query,
            selectedIndex: 0
          })
          view.dispatch(tr)
        }, 0)

        return false
      }
    },

    view(editorView) {
      const container = document.createElement("div")
      container.className = "at-mention-menu"
      container.setAttribute("role", "listbox")
      container.setAttribute("aria-label", "Mention a workspace item")
      document.body.appendChild(container)

      // Header
      const header = document.createElement("div")
      header.className = "at-mention-header"
      header.textContent = "Mention"
      container.appendChild(header)

      // Search display
      const searchDisplay = document.createElement("div")
      searchDisplay.className = "at-mention-search"
      const searchIcon = document.createElement("span")
      searchIcon.className = "at-mention-search-icon"
      const querySpan = document.createElement("span")
      querySpan.className = "query-text"
      const cursor = document.createElement("span")
      cursor.className = "at-mention-cursor"
      searchDisplay.appendChild(searchIcon)
      searchDisplay.appendChild(querySpan)
      searchDisplay.appendChild(cursor)
      container.appendChild(searchDisplay)

      // File list
      const fileList = document.createElement("div")
      fileList.className = "at-mention-files"
      container.appendChild(fileList)

      // Empty state
      const emptyState = document.createElement("div")
      emptyState.className = "at-mention-empty"
      emptyState.textContent = "No workspace items found"
      container.appendChild(emptyState)

      function selectFile(index: number) {
        const state = atMentionPluginKey.getState(editorView.state)
        if (!state?.active || !state.range) return

        const files = filterFiles(getFiles(), state.query)
        const file = files[index]
        if (file) {
          insertFileLink(editorView, file, state.range, schema)
        }
      }

      function update() {
        const state = atMentionPluginKey.getState(editorView.state)

        if (!state?.active) {
          container.style.display = "none"
          return
        }

        const files = filterFiles(getFiles(), state.query)

        // Update search display
        querySpan.textContent = state.query
        const selectedFile = files[state.selectedIndex] ?? files[0]
        searchIcon.innerHTML = selectedFile ? mentionIconMarkup(selectedFile) : ""

        // Display before measuring so the fixed menu can be kept in the viewport.
        const { from } = editorView.state.selection
        const coords = editorView.coordsAtPos(from)
        container.style.display = "flex"

        // Show empty state or file list
        if (files.length === 0) {
          fileList.style.display = "none"
          emptyState.style.display = "block"
        } else {
          fileList.style.display = "block"
          emptyState.style.display = "none"
        }

        // Render files
        fileList.innerHTML = files.slice(0, 20).map((file, index) => `
          <button type="button" role="option" aria-selected="${index === state.selectedIndex}" class="at-mention-item ${index === state.selectedIndex ? "selected" : ""}" data-index="${index}">
            <span class="at-mention-item-icon">${mentionIconMarkup(file)}</span>
            <span class="at-mention-item-content">
              <span class="at-mention-item-name">${highlightMatch(file.name, state.query)}</span>
              <span class="at-mention-item-path">${escapeHtml(getRelativePath(file.path))}</span>
            </span>
          </button>
        `).join("")

        // Keep pointer hover and keyboard selection in sync.
        fileList.querySelectorAll(".at-mention-item").forEach((item) => {
          item.addEventListener("mouseenter", () => {
            const index = Number.parseInt((item as HTMLElement).dataset.index || "0", 10)
            if (index === state.selectedIndex) return
            const tr = editorView.state.tr.setMeta(atMentionPluginKey, { selectedIndex: index })
            editorView.dispatch(tr)
          })
        })

        // Scroll selected into view
        const selectedItem = fileList.querySelector(".at-mention-item.selected")
        selectedItem?.scrollIntoView({ block: "nearest" })

        const menuRect = container.getBoundingClientRect()
        const left = Math.min(
          Math.max(8, coords.left),
          Math.max(8, window.innerWidth - menuRect.width - 8)
        )
        const below = coords.bottom + 8
        const top = below + menuRect.height <= window.innerHeight - 8
          ? below
          : Math.max(8, coords.top - menuRect.height - 8)
        container.style.left = `${left}px`
        container.style.top = `${top}px`
      }

      // Select on pointer-down so clicking cannot move the editor selection
      // away from the active mention range before the item is applied.
      fileList.addEventListener("pointerdown", (event) => {
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>(".at-mention-item")
          : null
        if (!target || !fileList.contains(target)) return
        event.preventDefault()
        event.stopPropagation()
        selectFile(Number.parseInt(target.dataset.index || "0", 10))
      })

      // Close on outside click
      const handleOutsideClick = (e: PointerEvent) => {
        if (!container.contains(e.target as Node)) {
          const state = atMentionPluginKey.getState(editorView.state)
          if (state?.active) {
            const tr = editorView.state.tr.setMeta(atMentionPluginKey, {
              active: false,
              query: "",
              range: null,
              selectedIndex: 0
            })
            editorView.dispatch(tr)
          }
        }
      }
      document.addEventListener("pointerdown", handleOutsideClick)

      return {
        update,
        destroy() {
          document.removeEventListener("pointerdown", handleOutsideClick)
          container.remove()
        }
      }
    }
  })
}

function filterFiles(files: FileItem[], query: string): FileItem[] {
  return searchMentionItems(files, query, (file) => file.name, (file) => file.path)
}

function insertFileLink(view: EditorView, file: FileItem, range: { from: number; to: number }, schema: Schema) {
  // Delete the @ and query, insert link
  let tr = view.state.tr.delete(range.from, view.state.selection.from)
  tr = tr.insert(range.from, createMentionLinkText(schema, file))

  // Close the menu
  tr = tr.setMeta(atMentionPluginKey, {
    active: false,
    query: "",
    range: null,
    selectedIndex: 0
  })

  view.dispatch(tr)
  view.focus()
}

export function createMentionLinkText(schema: Schema, file: FileItem) {
  const displayName = file.name.replace(/\.md$/, "")
  return schema.text(displayName, [
    schema.marks.link.create({
      href: file.path,
      mention: true,
      mentionKind: renderedMentionKind(file.kind, file.path)
    })
  ])
}

function mentionIconMarkup(file: FileItem): string {
  return MENTION_ICONS[renderedMentionKind(file.kind, file.path)]
}

function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text)
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) return escapeHtml(text)

  const before = text.slice(0, index)
  const match = text.slice(index, index + query.length)
  const after = text.slice(index + query.length)

  return `${escapeHtml(before)}<strong>${escapeHtml(match)}</strong>${escapeHtml(after)}`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return entities[char] || char
  })
}

function getRelativePath(fullPath: string): string {
  // Extract just the parent folder and filename
  const parts = fullPath.split("/")
  if (parts.length <= 2) return fullPath
  return ".../" + parts.slice(-2).join("/")
}

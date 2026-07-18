// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema } from "prosemirror-model"
import { searchMentionItems } from "../mentionSearch"

export const atMentionPluginKey = new PluginKey("atMention")

export interface FileItem {
  name: string
  path: string
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
            const newIndex = Math.min(state.selectedIndex + 1, files.length - 1)
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
      container.style.cssText = `
        position: absolute;
        z-index: 1000;
        background: white;
        border: 1px solid hsl(214.3, 31.8%, 91.4%);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        min-width: 240px;
        max-width: 320px;
        max-height: 300px;
        overflow: hidden;
        display: none;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
      `
      document.body.appendChild(container)

      // Header
      const header = document.createElement("div")
      header.style.cssText = `
        padding: 8px 12px;
        border-bottom: 1px solid hsl(214.3, 31.8%, 91.4%);
        color: hsl(215.4, 16.3%, 46.9%);
        font-size: 12px;
      `
      header.textContent = "Link to file..."
      container.appendChild(header)

      // Search display
      const searchDisplay = document.createElement("div")
      searchDisplay.className = "at-mention-search"
      searchDisplay.style.cssText = `
        padding: 8px 12px;
        border-bottom: 1px solid hsl(214.3, 31.8%, 91.4%);
        display: flex;
        align-items: center;
        gap: 6px;
      `
      const atSymbol = document.createElement("span")
      atSymbol.textContent = "@"
      atSymbol.style.cssText = `color: hsl(222.2, 47.4%, 41.2%); font-weight: 500;`
      const querySpan = document.createElement("span")
      querySpan.className = "query-text"
      const cursor = document.createElement("span")
      cursor.style.cssText = `
        display: inline-block;
        width: 1px;
        height: 16px;
        background: hsl(222.2, 84%, 4.9%);
        animation: blink 1s infinite;
      `
      searchDisplay.appendChild(atSymbol)
      searchDisplay.appendChild(querySpan)
      searchDisplay.appendChild(cursor)
      container.appendChild(searchDisplay)

      // File list
      const fileList = document.createElement("div")
      fileList.className = "at-mention-files"
      fileList.style.cssText = `
        overflow-y: auto;
        max-height: 220px;
        padding: 4px;
      `
      container.appendChild(fileList)

      // Empty state
      const emptyState = document.createElement("div")
      emptyState.className = "at-mention-empty"
      emptyState.style.cssText = `
        padding: 16px;
        text-align: center;
        color: hsl(215.4, 16.3%, 46.9%);
        font-size: 13px;
        display: none;
      `
      emptyState.textContent = "No files found"
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

        // Position the menu
        const { from } = editorView.state.selection
        const coords = editorView.coordsAtPos(from)
        container.style.left = `${coords.left}px`
        container.style.top = `${coords.bottom + 8}px`
        container.style.display = "flex"

        // Show empty state or file list
        if (files.length === 0) {
          fileList.style.display = "none"
          emptyState.style.display = "block"
          return
        }

        fileList.style.display = "block"
        emptyState.style.display = "none"

        // Render files
        fileList.innerHTML = files.slice(0, 20).map((file, index) => `
          <div class="at-mention-item ${index === state.selectedIndex ? "selected" : ""}" data-index="${index}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; color: hsl(215.4, 16.3%, 46.9%);">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <div class="at-mention-item-content">
              <div class="at-mention-item-name">${highlightMatch(file.name, state.query)}</div>
              <div class="at-mention-item-path">${getRelativePath(file.path)}</div>
            </div>
          </div>
        `).join("")

        // Add click handlers
        fileList.querySelectorAll(".at-mention-item").forEach((item) => {
          item.addEventListener("mousedown", (e) => {
            e.preventDefault()
            e.stopPropagation()
            const index = parseInt((item as HTMLElement).dataset.index || "0")
            selectFile(index)
          })
          item.addEventListener("mouseenter", () => {
            const index = parseInt((item as HTMLElement).dataset.index || "0")
            const tr = editorView.state.tr.setMeta(atMentionPluginKey, { selectedIndex: index })
            editorView.dispatch(tr)
          })
        })

        // Scroll selected into view
        const selectedItem = fileList.querySelector(".at-mention-item.selected")
        if (selectedItem) {
          selectedItem.scrollIntoView({ block: "nearest" })
        }
      }

      // Close on outside click
      const handleOutsideClick = (e: MouseEvent) => {
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
      document.addEventListener("mousedown", handleOutsideClick)

      return {
        update,
        destroy() {
          document.removeEventListener("mousedown", handleOutsideClick)
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
  const linkMark = schema.marks.link
  const displayName = file.name.replace(/\.md$/, "")

  // Delete the @ and query, insert link
  let tr = view.state.tr.delete(range.from, view.state.selection.from)
  const linkText = schema.text(displayName, [linkMark.create({ href: file.path })])
  tr = tr.insert(range.from, linkText)

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

// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, EditorState, Transaction, TextSelection } from "prosemirror-state"
import { Decoration, DecorationSet, EditorView } from "prosemirror-view"
import { Schema } from "prosemirror-model"
import { setBlockType, wrapIn } from "prosemirror-commands"
import { chooseAndUploadAsset, reportEditorError } from "../platform"
import { BLOCK_TYPE_ICONS } from "./blockTypePresentation"

const FILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M213.66,82.34l-44-44A8,8,0,0,0,164,36H72A20,20,0,0,0,52,56V200a20,20,0,0,0,20,20H184a20,20,0,0,0,20-20V88A8,8,0,0,0,213.66,82.34ZM172,63.31,188.69,80H172ZM188,200a4,4,0,0,1-4,4H72a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4h84V88a8,8,0,0,0,8,8h24Z"></path></svg>`
const IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Zm48,68a8,8,0,0,1-8,8H72a8,8,0,0,1-6.65-12.44l24-36a8,8,0,0,1,12.46-.81L126.4,153l34.93-46.58a8,8,0,0,1,12.73-.15l40,48A8,8,0,0,1,212,168Z"></path></svg>`
const CARET_RIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path></svg>`

export const slashCommandsPluginKey = new PluginKey("slashCommands")

const SLASH_MENU_GAP = 8
const SLASH_MENU_MARGIN = 8
const SLASH_MENU_MAX_HEIGHT = 340

interface SlashMenuPlacementInput {
  anchor: { left: number; top: number; bottom: number }
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  gap?: number
  margin?: number
  maxHeight?: number
}

export interface SlashMenuPlacement {
  left: number
  top: number
  maxHeight: number
  side: "above" | "below"
}

interface ScrollCanvasGeometry {
  left: number
  top: number
  scrollLeft: number
  scrollTop: number
}

export function viewportPlacementToScrollCanvas(
  placement: Pick<SlashMenuPlacement, "left" | "top">,
  canvas: ScrollCanvasGeometry
): { left: number; top: number } {
  return {
    left: placement.left - canvas.left + canvas.scrollLeft,
    top: placement.top - canvas.top + canvas.scrollTop
  }
}

export function computeSlashMenuPlacement({
  anchor,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  gap = SLASH_MENU_GAP,
  margin = SLASH_MENU_MARGIN,
  maxHeight = SLASH_MENU_MAX_HEIGHT
}: SlashMenuPlacementInput): SlashMenuPlacement {
  const availableWidth = Math.max(0, viewportWidth - margin * 2)
  const renderedWidth = Math.min(menuWidth, availableWidth)
  const left = Math.min(
    Math.max(margin, anchor.left),
    Math.max(margin, viewportWidth - margin - renderedWidth)
  )
  const belowTop = anchor.bottom + gap
  const aboveBottom = anchor.top - gap
  const belowSpace = Math.max(0, viewportHeight - margin - belowTop)
  const aboveSpace = Math.max(0, aboveBottom - margin)
  const desiredHeight = Math.min(menuHeight, maxHeight)
  const side = belowSpace >= desiredHeight || belowSpace >= aboveSpace ? "below" : "above"
  const availableHeight = side === "below" ? belowSpace : aboveSpace
  const renderedHeight = Math.min(desiredHeight, availableHeight)

  return {
    left,
    top: side === "below" ? belowTop : Math.max(margin, aboveBottom - renderedHeight),
    maxHeight: Math.min(maxHeight, availableHeight),
    side
  }
}

interface SlashCommand {
  name: string
  aliases: string[]
  description: string
  icon: string
  execute: (view: EditorView) => void
}

export function createCommands(schema: Schema): SlashCommand[] {
  const commands: SlashCommand[] = []

  if (schema.nodes.heading) {
    commands.push({
      name: "Heading 1",
      aliases: ["h1", "heading1", "#"],
      description: "Large section heading",
      icon: BLOCK_TYPE_ICONS.heading1,
      execute: (view) => {
        const { state, dispatch } = view
        setBlockType(schema.nodes.heading, { level: 1 })(state, dispatch)
        view.focus()
      }
    })
    commands.push({
      name: "Heading 2",
      aliases: ["h2", "heading2", "##"],
      description: "Medium section heading",
      icon: BLOCK_TYPE_ICONS.heading2,
      execute: (view) => {
        const { state, dispatch } = view
        setBlockType(schema.nodes.heading, { level: 2 })(state, dispatch)
        view.focus()
      }
    })
    commands.push({
      name: "Heading 3",
      aliases: ["h3", "heading3", "###"],
      description: "Small section heading",
      icon: BLOCK_TYPE_ICONS.heading3,
      execute: (view) => {
        const { state, dispatch } = view
        setBlockType(schema.nodes.heading, { level: 3 })(state, dispatch)
        view.focus()
      }
    })
  }

  if (schema.nodes.bullet_item) {
    commands.push({
      name: "Bullet Item",
      aliases: ["bullet", "ul", "unordered", "list"],
      description: "Create a bullet list item",
      icon: BLOCK_TYPE_ICONS.bulletList,
      execute: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        const bulletItem = schema.nodes.bullet_item.create({ indent: 0 })
        const tr = state.tr.replaceWith($from.before(), $from.after(), bulletItem)
        tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1))
        dispatch(tr.scrollIntoView())
        view.focus()
      }
    })
  }

  if (schema.nodes.numbered_item) {
    commands.push({
      name: "Numbered Item",
      aliases: ["numbered", "ol", "ordered", "number"],
      description: "Create a numbered list item",
      icon: BLOCK_TYPE_ICONS.numberedList,
      execute: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        const numberedItem = schema.nodes.numbered_item.create({ indent: 0 })
        const tr = state.tr.replaceWith($from.before(), $from.after(), numberedItem)
        tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1))
        dispatch(tr.scrollIntoView())
        view.focus()
      }
    })
  }

  if (schema.nodes.task_item) {
    commands.push({
      name: "Task Item",
      aliases: ["todo", "task", "checkbox", "checklist"],
      description: "Create a task with checkbox",
      icon: BLOCK_TYPE_ICONS.checkbox,
      execute: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        const taskItem = schema.nodes.task_item.create({ indent: 0, checked: false })
        const tr = state.tr.replaceWith($from.before(), $from.after(), taskItem)
        tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1))
        dispatch(tr.scrollIntoView())
        view.focus()
      }
    })
  }

  if (schema.nodes.blockquote) {
    commands.push({
      name: "Quote",
      aliases: ["quote", "blockquote"],
      description: "Create a block quote",
      icon: BLOCK_TYPE_ICONS.quote,
      execute: (view) => {
        const { state, dispatch } = view
        wrapIn(schema.nodes.blockquote)(state, dispatch)
        view.focus()
      }
    })
  }

  if (schema.nodes.details) {
    commands.push({
      name: "Toggle",
      aliases: ["toggle", "collapsible", "collapse", "dropdown"],
      description: "Create a collapsible toggle block",
      icon: CARET_RIGHT_SVG,
      execute: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        // Create toggle with empty paragraph inside (empty summary, placeholder shown via CSS)
        const paragraph = schema.nodes.paragraph.create()
        const toggle = schema.nodes.details.create({ open: true, summary: "" }, paragraph)
        const tr = state.tr.replaceWith($from.before(), $from.after(), toggle)
        // Place cursor inside the toggle
        tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1))
        dispatch(tr.scrollIntoView())
        view.focus()
      }
    })
  }

  if (schema.nodes.code_block) {
    commands.push({
      name: "Code Block",
      aliases: ["code", "codeblock", "pre"],
      description: "Create a code block",
      icon: BLOCK_TYPE_ICONS.codeBlock,
      execute: (view) => {
        const { state, dispatch } = view
        setBlockType(schema.nodes.code_block)(state, dispatch)
        view.focus()
      }
    })
  }

  if (schema.nodes.mermaid) {
    commands.push({
      name: "Mermaid Diagram",
      aliases: ["mermaid", "diagram", "flowchart", "sequence", "chart"],
      description: "Insert a Mermaid diagram",
      icon: BLOCK_TYPE_ICONS.mermaid,
      execute: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        const defaultCode = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Result 1]
    B -->|No| D[Result 2]`
        const mermaid = schema.nodes.mermaid.create({ code: defaultCode, mode: "split" })
        const tr = state.tr.replaceWith($from.before(), $from.after(), mermaid)
        dispatch(tr)
        view.focus()
      }
    })
  }

  if (schema.nodes.database_embed) {
    commands.push({
      name: "Database",
      aliases: ["database", "db", "embed"],
      description: "Embed a database view",
      icon: BLOCK_TYPE_ICONS.table,
      execute: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        const embed = schema.nodes.database_embed.create({
          source: "",
          viewType: "table",
          selectingSource: true
        })
        const tr = state.tr.replaceWith($from.before(), $from.after(), embed)
        dispatch(tr)
        view.focus()
      }
    })
  }

  if (schema.nodes.table) {
    commands.push({
      name: "Table",
      aliases: ["table", "grid"],
      description: "Insert a table",
      icon: BLOCK_TYPE_ICONS.table,
      execute: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        const cell = schema.nodes.table_cell.create(null, schema.text(" "))
        const headerCell = schema.nodes.table_header.create(null, schema.text(" "))
        const headerRow = schema.nodes.table_row.create(null, [headerCell, headerCell.copy(headerCell.content), headerCell.copy(headerCell.content)])
        const dataRow = schema.nodes.table_row.create(null, [cell, cell.copy(cell.content), cell.copy(cell.content)])
        const table = schema.nodes.table.create(null, [headerRow, dataRow, dataRow.copy(dataRow.content)])
        const tr = state.tr.replaceWith($from.before(), $from.after(), table)
        dispatch(tr)
        view.focus()
      }
    })
  }

  if (schema.nodes.file_embed) {
    commands.push({
      name: "File",
      aliases: ["file", "pdf", "document", "attachment"],
      description: "Insert a PDF file block",
      icon: FILE_SVG,
      execute: async (view) => {
        try {
          const relativePath = await chooseAndUploadAsset("application/pdf,.pdf")
          if (!relativePath) return

          const { state, dispatch } = view
          const { $from } = state.selection
          const fileEmbed = schema.nodes.file_embed.create({ src: relativePath })
          const tr = state.tr.replaceWith($from.before(), $from.after(), fileEmbed)
          dispatch(tr)
          view.focus()
        } catch (err) {
          reportEditorError(err)
        }
      }
    })
  }

  if (schema.nodes.image) {
    commands.push({
      name: "Image",
      aliases: ["image", "img", "picture", "photo"],
      description: "Insert an image from file",
      icon: IMAGE_SVG,
      execute: async (view) => {
        try {
          const relativePath = await chooseAndUploadAsset("image/*")
          if (!relativePath) return

          // Insert image node
          const { state, dispatch } = view
          const { $from } = state.selection
          const image = schema.nodes.image.create({ src: relativePath })
          const tr = state.tr.replaceWith($from.before(), $from.after(), image)
          dispatch(tr)
          view.focus()
        } catch (err) {
          reportEditorError(err)
        }
      }
    })
  }

  if (schema.nodes.horizontal_rule) {
    commands.push({
      name: "Divider",
      aliases: ["divider", "hr", "line", "separator"],
      description: "Create a horizontal divider",
      icon: BLOCK_TYPE_ICONS.divider,
      execute: (view) => {
        const { state, dispatch } = view
        const { $from } = state.selection
        const tr = state.tr.replaceWith($from.before(), $from.after(), schema.nodes.horizontal_rule.create())
        dispatch(tr)
        view.focus()
      }
    })
  }

  return commands
}

interface PluginState {
  active: boolean
  query: string
  range: { from: number; to: number } | null
  selectedIndex: number
  commands: SlashCommand[]
  filteredCommands: SlashCommand[]
}

function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  if (!query) return commands
  const lowerQuery = query.toLowerCase()
  return commands.filter(cmd =>
    cmd.name.toLowerCase().includes(lowerQuery) ||
    cmd.aliases.some(alias => alias.toLowerCase().includes(lowerQuery))
  )
}

export function slashCommandsPlugin(schema: Schema) {
  const commands = createCommands(schema)

  return new Plugin<PluginState>({
    key: slashCommandsPluginKey,

    state: {
      init(): PluginState {
        return {
          active: false,
          query: "",
          range: null,
          selectedIndex: 0,
          commands,
          filteredCommands: commands
        }
      },

      apply(tr, state): PluginState {
        const meta = tr.getMeta(slashCommandsPluginKey)
        if (meta) {
          return { ...state, ...meta }
        }

        if (!state.active) return state

        // Check if selection has moved away from the slash
        const { selection } = tr
        if (state.range && selection.from < state.range.from) {
          return { ...state, active: false, query: "", range: null, selectedIndex: 0, filteredCommands: commands }
        }

        return state
      }
    },

    props: {
      handleDOMEvents: {
        keydown(view, event) {
          const state = slashCommandsPluginKey.getState(view.state)

          if (!state?.active) {
            return false
          }

          // Handle navigation when menu is active
          if (event.key === "ArrowDown") {
            event.preventDefault()
            event.stopPropagation()
            const newIndex = Math.min(state.selectedIndex + 1, state.filteredCommands.length - 1)
            const tr = view.state.tr.setMeta(slashCommandsPluginKey, { selectedIndex: newIndex })
            view.dispatch(tr)
            return true
          }

          if (event.key === "ArrowUp") {
            event.preventDefault()
            event.stopPropagation()
            const newIndex = Math.max(state.selectedIndex - 1, 0)
            const tr = view.state.tr.setMeta(slashCommandsPluginKey, { selectedIndex: newIndex })
            view.dispatch(tr)
            return true
          }

          if (event.key === "Enter") {
            event.preventDefault()
            event.stopPropagation()
            const command = state.filteredCommands[state.selectedIndex]
            if (command && state.range) {
              // Delete the slash and query
              const tr = view.state.tr.delete(state.range.from, view.state.selection.from)
              tr.setMeta(slashCommandsPluginKey, { active: false, query: "", range: null, selectedIndex: 0, filteredCommands: commands })
              view.dispatch(tr)
              // Execute the command
              setTimeout(() => {
                command.execute(view)
              }, 0)
            }
            return true
          }

          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            const tr = view.state.tr.setMeta(slashCommandsPluginKey, {
              active: false,
              query: "",
              range: null,
              selectedIndex: 0,
              filteredCommands: commands
            })
            view.dispatch(tr)
            return true
          }

          if (event.key === "Backspace" && state.range) {
            const { $from } = view.state.selection
            if ($from.pos <= state.range.from + 1) {
              // Deactivate if backspacing past the slash
              const tr = view.state.tr.setMeta(slashCommandsPluginKey, {
                active: false,
                query: "",
                range: null,
                selectedIndex: 0,
                filteredCommands: commands
              })
              view.dispatch(tr)
              return false
            }
          }

          return false
        }
      },

      handleKeyDown(view, event) {
        const state = slashCommandsPluginKey.getState(view.state)

        if (!state?.active) {
          // Check for slash at start of line or after space
          if (event.key === "/") {
            const { $from } = view.state.selection
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "\ufffc")
            const isAtLineStart = textBefore.length === 0 || textBefore.endsWith(" ") || textBefore.endsWith("\n")

            if (isAtLineStart) {
              // Activate slash commands after the / is inserted
              setTimeout(() => {
                const tr = view.state.tr.setMeta(slashCommandsPluginKey, {
                  active: true,
                  query: "",
                  range: { from: view.state.selection.from - 1, to: view.state.selection.from },
                  selectedIndex: 0,
                  filteredCommands: commands
                })
                view.dispatch(tr)
              }, 0)
            }
          }
        }
        return false
      },

      handleTextInput(view, from, to, text) {
        const state = slashCommandsPluginKey.getState(view.state)
        if (!state?.active) return false

        // Update query
        setTimeout(() => {
          const pluginState = slashCommandsPluginKey.getState(view.state)
          if (!pluginState?.active || !pluginState.range) return

          const { $from } = view.state.selection
          const query = $from.parent.textBetween(pluginState.range.from - $from.start() + 1, $from.parentOffset, null, "\ufffc")
          const filtered = filterCommands(commands, query)

          const tr = view.state.tr.setMeta(slashCommandsPluginKey, {
            query,
            filteredCommands: filtered,
            selectedIndex: 0
          })
          view.dispatch(tr)
        }, 0)

        return false
      }
    },

    view(editorView) {
      const scrollCanvas = editorView.dom.closest("[data-rumi-editor-canvas]") as HTMLElement | null
      const menuHost = scrollCanvas ?? document.body
      const container = document.createElement("div")
      container.className = "slash-commands-menu"
      container.setAttribute("role", "listbox")
      container.setAttribute("aria-label", "Insert a block")
      container.style.cssText = `
        position: ${scrollCanvas ? "absolute" : "fixed"};
        z-index: 1000;
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        border: 1px solid hsl(var(--border));
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        width: min(280px, calc(100vw - 16px));
        min-width: min(220px, calc(100vw - 16px));
        max-height: ${SLASH_MENU_MAX_HEIGHT}px;
        overflow: hidden;
        display: none;
        flex-direction: column;
      `
      menuHost.appendChild(container)

      // Header with search input
      const header = document.createElement("div")
      header.className = "slash-commands-header"
      header.style.cssText = `
        padding: 8px 12px;
        border-bottom: 1px solid hsl(var(--border));
      `

      const label = document.createElement("div")
      label.textContent = "Type to filter..."
      label.style.cssText = `
        font-size: 11px;
        color: hsl(var(--muted-foreground));
        margin-bottom: 4px;
      `

      const searchDisplay = document.createElement("div")
      searchDisplay.className = "slash-search-display"
      searchDisplay.style.cssText = `
        font-size: 14px;
        color: hsl(var(--foreground));
        min-height: 20px;
        display: flex;
        align-items: center;
      `

      const querySpan = document.createElement("span")
      querySpan.className = "query-text"

      const cursor = document.createElement("span")
      cursor.className = "search-cursor"
      cursor.style.cssText = `
        display: inline-block;
        width: 1px;
        height: 16px;
        background: hsl(var(--foreground));
        margin-left: 1px;
        animation: blink 1s infinite;
      `

      searchDisplay.appendChild(querySpan)
      searchDisplay.appendChild(cursor)
      header.appendChild(label)
      header.appendChild(searchDisplay)
      container.appendChild(header)

      // Add cursor blink animation
      const style = document.createElement("style")
      style.textContent = `
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `
      document.head.appendChild(style)

      // Commands list
      const commandsList = document.createElement("div")
      commandsList.className = "slash-commands-list"
      commandsList.style.cssText = `
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 4px;
      `
      container.appendChild(commandsList)

      function positionMenu() {
        const state = slashCommandsPluginKey.getState(editorView.state)
        if (!state?.active || container.style.display === "none") return

        const { from } = editorView.state.selection
        const coords = editorView.coordsAtPos(from)
        container.style.maxHeight = `${SLASH_MENU_MAX_HEIGHT}px`
        const menuRect = container.getBoundingClientRect()
        const placement = computeSlashMenuPlacement({
          anchor: coords,
          menuWidth: menuRect.width,
          menuHeight: menuRect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        })

        const canvasRect = scrollCanvas?.getBoundingClientRect()
        const menuPosition = scrollCanvas && canvasRect
          ? viewportPlacementToScrollCanvas(placement, {
              left: canvasRect.left,
              top: canvasRect.top,
              scrollLeft: scrollCanvas.scrollLeft,
              scrollTop: scrollCanvas.scrollTop
            })
          : placement

        container.dataset.side = placement.side
        container.style.left = `${menuPosition.left}px`
        container.style.top = `${menuPosition.top}px`
        container.style.maxHeight = `${placement.maxHeight}px`
      }

      window.addEventListener("resize", positionMenu)
      window.visualViewport?.addEventListener("resize", positionMenu)

      function executeCommand(index: number) {
        const state = slashCommandsPluginKey.getState(editorView.state)
        if (!state) return

        const command = state.filteredCommands[index]
        if (command && state.range) {
          const tr = editorView.state.tr.delete(state.range.from, editorView.state.selection.from)
          tr.setMeta(slashCommandsPluginKey, { active: false, query: "", range: null, selectedIndex: 0, filteredCommands: commands })
          editorView.dispatch(tr)
          setTimeout(() => {
            command.execute(editorView)
          }, 0)
        }
      }

      function update() {
        const state = slashCommandsPluginKey.getState(editorView.state)
        if (!state?.active || state.filteredCommands.length === 0) {
          container.style.display = "none"
          return
        }

        // Update search display
        querySpan.textContent = state.query

        // Render commands
        commandsList.innerHTML = state.filteredCommands.map((cmd, index) => `
          <div role="option" aria-selected="${index === state.selectedIndex}" class="slash-command-item ${index === state.selectedIndex ? "selected" : ""}" data-index="${index}">
            <span class="slash-command-icon">${cmd.icon}</span>
            <div class="slash-command-content">
              <div class="slash-command-name">${cmd.name}</div>
              <div class="slash-command-description">${cmd.description}</div>
            </div>
          </div>
        `).join("")

        // Add click handlers
        commandsList.querySelectorAll(".slash-command-item").forEach((item) => {
          item.addEventListener("mousedown", (e) => {
            e.preventDefault()
            e.stopPropagation()
            const index = parseInt((item as HTMLElement).dataset.index || "0")
            executeCommand(index)
          })
          item.addEventListener("mouseenter", () => {
            const index = parseInt((item as HTMLElement).dataset.index || "0")
            const tr = editorView.state.tr.setMeta(slashCommandsPluginKey, { selectedIndex: index })
            editorView.dispatch(tr)
          })
        })

        // Decide the opening side after rendering. The menu itself lives in the
        // scrolling canvas, so browser layout keeps it attached to the line.
        container.style.visibility = "hidden"
        container.style.display = "flex"
        positionMenu()
        container.style.visibility = "visible"

        // Scroll selected item into view
        const selectedItem = commandsList.querySelector(".slash-command-item.selected")
        if (selectedItem) {
          const selectedRect = selectedItem.getBoundingClientRect()
          const listRect = commandsList.getBoundingClientRect()
          if (selectedRect.top < listRect.top) {
            commandsList.scrollTop -= listRect.top - selectedRect.top
          } else if (selectedRect.bottom > listRect.bottom) {
            commandsList.scrollTop += selectedRect.bottom - listRect.bottom
          }
        }
      }

      return {
        update,
        destroy() {
          window.removeEventListener("resize", positionMenu)
          window.visualViewport?.removeEventListener("resize", positionMenu)
          container.remove()
          style.remove()
        }
      }
    }
  })
}

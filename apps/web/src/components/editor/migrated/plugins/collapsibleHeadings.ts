// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey, NodeSelection, TextSelection } from "prosemirror-state"
import { Decoration, DecorationSet, EditorView, NodeView } from "prosemirror-view"
import { Node as PmNode } from "prosemirror-model"
import { splitBlock } from "prosemirror-commands"
import { multiBlockSelectionKey } from "./multiBlockSelection"

// Phosphor CaretDown (regular/outline) — rotated via CSS for collapsed state
const CARET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path></svg>`

export interface CollapsibleHeadingsState {
  collapsed: Set<number>
}

export const collapsibleHeadingsKey = new PluginKey<CollapsibleHeadingsState>("collapsibleHeadings")

export function toggleHeadingCollapse(view: EditorView, headingPos: number) {
  const pluginState = collapsibleHeadingsKey.getState(view.state)
  if (!pluginState) return

  const newCollapsed = new Set(pluginState.collapsed)
  if (newCollapsed.has(headingPos)) {
    newCollapsed.delete(headingPos)
  } else {
    newCollapsed.add(headingPos)
  }

  const tr = view.state.tr.setMeta(collapsibleHeadingsKey, { collapsed: newCollapsed })
  view.dispatch(tr)
}

export function expandHeading(view: EditorView, headingPos: number) {
  const pluginState = collapsibleHeadingsKey.getState(view.state)
  if (!pluginState || !pluginState.collapsed.has(headingPos)) return

  const newCollapsed = new Set(pluginState.collapsed)
  newCollapsed.delete(headingPos)
  const tr = view.state.tr.setMeta(collapsibleHeadingsKey, { collapsed: newCollapsed })
  view.dispatch(tr)
}

// Find the end of a heading's section: the position before the next heading of equal or higher level
export function findSectionEnd(doc: PmNode, headingPos: number, headingLevel: number): number {
  let sectionEnd = doc.content.size
  let pos = headingPos
  const headingNode = doc.nodeAt(headingPos)
  if (!headingNode) return sectionEnd

  pos = headingPos + headingNode.nodeSize

  while (pos < doc.content.size) {
    const node = doc.nodeAt(pos)
    if (!node) break
    if (node.type.name === "heading" && node.attrs.level <= headingLevel) {
      sectionEnd = pos
      break
    }
    pos += node.nodeSize
  }

  return sectionEnd
}

export function collapsibleHeadingsPlugin() {
  return new Plugin<CollapsibleHeadingsState>({
    key: collapsibleHeadingsKey,

    state: {
      init(): CollapsibleHeadingsState {
        return { collapsed: new Set() }
      },

      apply(tr, value): CollapsibleHeadingsState {
        const meta = tr.getMeta(collapsibleHeadingsKey)
        if (meta) return meta

        if (!tr.docChanged || value.collapsed.size === 0) return value

        // Remap positions through document changes and filter out positions
        // that no longer point to a heading node
        const newCollapsed = new Set<number>()
        for (const pos of value.collapsed) {
          const mappedPos = tr.mapping.map(pos)
          const node = tr.doc.nodeAt(mappedPos)
          if (node && node.type.name === "heading") {
            newCollapsed.add(mappedPos)
          }
        }
        return { collapsed: newCollapsed }
      }
    },

    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Enter") return false
        const { $from } = view.state.selection
        if ($from.parent.type.name !== "heading") return false
        const headingPos = $from.before($from.depth)
        const pluginState = collapsibleHeadingsKey.getState(view.state)
        if (!pluginState?.collapsed.has(headingPos)) return false
        expandHeading(view, headingPos)
        splitBlock(view.state, view.dispatch)
        return true
      },

      decorations(state) {
        const pluginState = collapsibleHeadingsKey.getState(state)
        if (!pluginState || pluginState.collapsed.size === 0) return null

        const decorations: Decoration[] = []
        const { doc } = state

        for (const headingPos of pluginState.collapsed) {
          const headingNode = doc.nodeAt(headingPos)
          if (!headingNode || headingNode.type.name !== "heading") continue

          const level = headingNode.attrs.level
          const sectionEnd = findSectionEnd(doc, headingPos, level)

          // Mark the heading itself as collapsed so its NodeView update() is triggered
          decorations.push(
            Decoration.node(headingPos, headingPos + headingNode.nodeSize, {}, { collapsed: true })
          )

          // Hide all blocks in the section after the heading
          let pos = headingPos + headingNode.nodeSize
          while (pos < sectionEnd) {
            const node = doc.nodeAt(pos)
            if (!node) break
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, { class: "pm-section-collapsed" })
            )
            pos += node.nodeSize
          }
        }

        return DecorationSet.create(doc, decorations)
      }
    }
  })
}

// ── Heading NodeView ──────────────────────────────────────────────────────────

class HeadingView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private caretButton: HTMLElement
  private node: PmNode

  constructor(
    node: PmNode,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    this.node = node

    const level = node.attrs.level
    this.dom = document.createElement("div")
    this.dom.className = `heading-block heading-level-${level}`

    this.caretButton = document.createElement("span")
    this.caretButton.className = "heading-caret"
    this.caretButton.contentEditable = "false"
    this.caretButton.addEventListener("mousedown", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = this.getPos()
      if (pos === undefined) return

      // Toggle collapse state, clear multi-block selection and NodeSelection in one transaction
      const pluginState = collapsibleHeadingsKey.getState(this.view.state)
      if (!pluginState) return
      const newCollapsed = new Set(pluginState.collapsed)
      if (newCollapsed.has(pos)) {
        newCollapsed.delete(pos)
      } else {
        newCollapsed.add(pos)
      }
      let tr = this.view.state.tr
      // NodeSelection (set by drag handle) also shows as blue — clear it
      if (this.view.state.selection instanceof NodeSelection) {
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)))
      }
      tr = tr
        .setMeta(collapsibleHeadingsKey, { collapsed: newCollapsed })
        .setMeta(multiBlockSelectionKey, { selectedBlocks: [], anchorBlock: null })
      this.view.dispatch(tr)
    })

    this.contentDOM = document.createElement(`h${level}`)
    this.contentDOM.className = `heading-content heading-level-${level}`

    this.dom.addEventListener("mousedown", this.onHeadingRowMouseDown)

    this.caretButton.innerHTML = CARET_SVG

    this.dom.appendChild(this.contentDOM)
    this.dom.appendChild(this.caretButton)
  }

  private onHeadingRowMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || this.caretButton.contains(event.target as Node)) return

    const textRange = document.createRange()
    textRange.selectNodeContents(this.contentDOM)
    const renderedTextRects = Array.from(textRange.getClientRects())
    const overRenderedText = renderedTextRects.some((rect) =>
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom
    )

    // Native ProseMirror positioning remains exact over the glyphs. The flex
    // row beside a heading is outside contentDOM, though, and otherwise maps
    // back to the start of the node instead of the visual end of its text.
    if (overRenderedText) return

    const contentRect = this.contentDOM.getBoundingClientRect()
    if (
      event.clientX < contentRect.left ||
      event.clientY < contentRect.top ||
      event.clientY > contentRect.bottom
    ) return

    const pos = this.getPos()
    if (pos === undefined) return

    event.preventDefault()
    event.stopPropagation()
    const end = pos + 1 + this.node.content.size
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, end)))
    this.view.focus()
  }

  update(node: PmNode, decorations: readonly Decoration[]): boolean {
    if (node.type !== this.node.type) return false
    if (node.attrs.level !== this.node.attrs.level) return false
    this.node = node
    const isCollapsed = decorations.some(d => (d as any).spec?.collapsed)
    this.dom.classList.toggle("is-collapsed", isCollapsed)
    return true
  }

  stopEvent(event: Event): boolean {
    return this.caretButton.contains(event.target as Node)
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    return this.caretButton.contains(mutation.target as Node)
  }

  destroy(): void {
    this.dom.removeEventListener("mousedown", this.onHeadingRowMouseDown)
  }
}

export function headingNodeView(
  node: PmNode,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  return new HeadingView(node, view, getPos)
}

import { Plugin } from "prosemirror-state"
import type { Node as ProseMirrorNode } from "prosemirror-model"
import { Decoration, DecorationSet } from "prosemirror-view"
import { numberedItemNumbers } from "../markdown"

/**
 * Shows each numbered item with the number it is saved with. The item gets
 * `counter-set: numbered-item <n>`; the stylesheet formats it per indent level.
 */
export function numberedListPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    state: {
      init: (_config, state) => numberedListDecorations(state.doc),
      apply: (tr, decorations) => (tr.docChanged ? numberedListDecorations(tr.doc) : decorations)
    },
    props: {
      decorations(state) {
        return this.getState(state)
      }
    }
  })
}

export function numberedListDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []
  const visit = (parent: ProseMirrorNode, start: number) => {
    const numbers = numberedItemNumbers(parent)
    parent.forEach((child, offset, index) => {
      const from = start + offset
      const number = numbers.get(index)
      if (number !== undefined) {
        decorations.push(Decoration.node(from, from + child.nodeSize, { style: `counter-set: numbered-item ${number}` }))
      } else if (!child.inlineContent && child.childCount > 0) {
        visit(child, from + 1)
      }
    })
  }
  visit(doc, 0)
  return DecorationSet.create(doc, decorations)
}

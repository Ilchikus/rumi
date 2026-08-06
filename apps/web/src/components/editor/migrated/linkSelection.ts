import type { MarkType } from "prosemirror-model"
import type { EditorState } from "prosemirror-state"

export interface LinkRange {
  from: number
  to: number
  href: string
}

export function linkRangeAtSelection(
  state: EditorState,
  linkType: MarkType | undefined = state.schema.marks.link
): LinkRange | null {
  if (!linkType || !state.selection.empty) return null
  return linkRangeAtPosition(state, state.selection.from, linkType)
}

export function linkRangeAtPosition(
  state: EditorState,
  position: number,
  linkType: MarkType | undefined = state.schema.marks.link
): LinkRange | null {
  if (!linkType || position < 0 || position > state.doc.content.size) return null

  const $position = state.doc.resolve(position)
  if (!$position.parent.isTextblock) return null

  const adjacentMarks = [
    linkType.isInSet($position.nodeAfter?.marks ?? []),
    linkType.isInSet($position.marks())
  ].filter(Boolean)

  for (const activeMark of adjacentMarks) {
    const href = String(activeMark!.attrs.href ?? "")
    const parentStart = $position.start()
    let segment: LinkRange | null = null
    let matchingSegment: LinkRange | null = null

    let offset = 0
    for (let index = 0; index < $position.parent.childCount; index += 1) {
      const node = $position.parent.child(index)
      const mark = linkType.isInSet(node.marks)
      const nodeFrom = parentStart + offset
      const nodeTo = nodeFrom + node.nodeSize
      if (mark && String(mark.attrs.href ?? "") === href) {
        if (!segment) segment = { from: nodeFrom, to: nodeTo, href }
        else segment.to = nodeTo
      } else if (segment && position >= segment.from && position <= segment.to) {
        matchingSegment = segment
        break
      } else {
        segment = null
      }
      offset += node.nodeSize
    }

    if (segment && position >= segment.from && position <= segment.to) {
      matchingSegment = segment
    }
    if (matchingSegment) return matchingSegment
  }

  return null
}

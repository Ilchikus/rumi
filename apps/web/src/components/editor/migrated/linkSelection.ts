import type { MarkType } from "prosemirror-model"
import type { EditorState } from "prosemirror-state"
import { isExternalLinkHref, normalizeLinkHref } from "./linkHref"

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
  const directRange = linkRangeAtPosition(state, state.selection.from, linkType)
  if (directRange) return directRange

  const markerAt = state.doc.nodeAt(state.selection.from)
  if (markerAt?.type.name === "link_marker") {
    return linkRangeAtPosition(
      state,
      state.selection.from + markerAt.nodeSize,
      linkType
    )
  }

  const markerBefore = state.selection.from > 0
    ? state.doc.nodeAt(state.selection.from - 1)
    : null
  if (markerBefore?.type.name === "link_marker") {
    return linkRangeAtPosition(state, state.selection.from, linkType)
  }

  // A derived leading marker makes the far edge of the anchor an explicit
  // rendered-link boundary too. Keep plain marked text conservative: only
  // resolve that edge when the complete anchor has its matching marker.
  const rangeBefore = linkRangeAtPosition(
    state,
    Math.max(0, state.selection.from - 1),
    linkType
  )
  if (
    rangeBefore?.to === state.selection.from &&
    hasMatchingLeadingMarker(state, rangeBefore)
  ) {
    return rangeBefore
  }
  return null
}

function hasMatchingLeadingMarker(state: EditorState, range: LinkRange): boolean {
  if (range.from <= 0) return false
  const marker = state.doc.nodeAt(range.from - 1)
  if (marker?.type.name !== "link_marker") return false

  return normalizeLinkHref(String(marker.attrs.href ?? "")) ===
      normalizeLinkHref(range.href) &&
    (marker.attrs.linkType === "external") === isExternalLinkHref(range.href)
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
    linkType.isInSet($position.marks()),
    ...($position.nodeAfter?.type.name === "link_marker"
      ? [linkType.isInSet($position.nodeBefore?.marks ?? [])]
      : [])
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

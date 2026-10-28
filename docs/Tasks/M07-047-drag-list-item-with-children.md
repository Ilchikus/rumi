---
status: verify
type: feature
milestone: M07
release: "0.1.19"
owner_layer: editor
coverage:
  - unit
  - ui-smoke
created: 2026-10-09
updated: 2026-10-09
---
# M07-047 Drag List Items With Their Children

## Goal

Dragging a list item by its handle moves its nested items with it, keeping their relative indent.

## Scope

- A list item's children are the list items directly after it with a deeper indent. Any other
  block, including an empty paragraph, ends them.
- Applies to a single dragged item and to every list item in a dragged block selection.
- The existing multi-block drop keeps relative indents and clamps to the maximum indent.
- Dropping into the item's own children is not offered. Dropping it back in place with a different
  indent shifts the whole group.

## Out Of Scope

- Keyboard and toolbar Move up/down, which still move single blocks.

## Required Coverage

- [x] Unit: children detection across bullet, numbered, and task items, stopping at shallower items
      and non-list blocks.
- [x] Browser QA: drag a parent below another item, into a deeper indent, and in place.

## Done When

A dragged parent arrives with all of its nested items in the same shape.

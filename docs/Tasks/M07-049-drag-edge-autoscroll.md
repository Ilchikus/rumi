---
status: done
type: feature
milestone: M07
release: "0.1.20"
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
created: 2026-11-03
updated: 2026-11-03
---
# M07-049 Drag near viewport edges to scroll

## Goal

Drag near viewport edges to scroll.

## Scope

Drag blocks scrolls the editor at 360 px/s in the outer 10%, 720 px/s in the outer 5%, at either edge; scrolling stops on drop, cancellation and destruction.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Editor geometry and drag lifecycle tests; browser drag QA.

## Implementation Notes

Part of the 0.1.20 desktop editor release.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

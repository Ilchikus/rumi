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
# M07-055 Render Mermaid source with Pele

## Goal

Render Mermaid source with Pele.

## Scope

Replace Mermaid.js in active and legacy rendering paths with lazy Pele, preserve source fences and error handling, and theme with CSS variables.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] NodeView lifecycle, error, stale-render and real Pele rendering tests; production build.

## Implementation Notes

Part of the 0.1.20 desktop editor release.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

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
# M07-054 Copy Mermaid source reliably

## Goal

Copy Mermaid source reliably.

## Scope

Triple-click and copy in Mermaid source preserves exact code; provide an explicit source-copy action that excludes editor controls.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Mermaid selection and clipboard interaction tests.

## Implementation Notes

Part of the 0.1.20 desktop editor release.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

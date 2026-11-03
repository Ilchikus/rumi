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
# M07-060 Restore blinking heading text caret

## Goal

Restore blinking heading text caret.

## Scope

Keep the native blinking caret in heading content, including clicks after text, without custom cursor overlays.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Heading interaction tests and browser visual QA.

## Implementation Notes

Part of the 0.1.20 desktop editor release.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

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
# M07-050 Insert date and time with keyboard shortcuts

## Goal

Insert date and time with keyboard shortcuts.

## Scope

Mod+; inserts local YYYY-MM-DD; Mod+Shift+; inserts local YYYY-MM-DD HH:mm. Browser actions are consumed in the editor and insertion is undoable.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Editor shortcut, local formatting, selection replacement and undo tests.

## Implementation Notes

Part of the 0.1.20 desktop editor release.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

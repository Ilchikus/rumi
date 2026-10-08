---
status: verify
type: feature
milestone: M07
release: 0.1.18
owner_layer: editor
coverage:
  - ui-smoke
created: 2026-10-05
updated: 2026-10-05
---
# M07-044 List Marker Alignment

## Goal

Align list markers with the first text line: task checkboxes move 4px lower and bullet markers 4px
higher.

## Scope

- `editor.css`:
  - `.task-item .task-checkbox` top offset changes from 2px to 6px.
  - `.bullet-decoration` moves up 4px via a relative offset, without changing row height or
    spacing.
- Numbered markers stay unchanged.

## Out Of Scope

- Row spacing or line-height changes.

## Owner Layer

editor

## Required Coverage

- [ ] Visual check in light and dark at indent levels 0–3, single and wrapped lines, and while the
      editor is zoomed to 90% and 125%.
- [ ] Update any layout assertion in `editorLayout.test.ts` that pins the old offsets.

## Done When

Checkbox and bullet markers sit centered on the first text line at every indent level.

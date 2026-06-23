---
status: doing
type: feature
milestone: M04
owner_layer: editor
coverage:
  - markdown
  - api
  - ui-smoke
created: "2026-06-22"
updated: "2026-06-22"
---
# M04-001 Editor Open Save Flow

## Goal

Connect ProseMirror editor state to server-backed page open/save.

## Scope

- Parse server Markdown body into ProseMirror.
- Keep ProseMirror as live state.
- Debounce save.
- Serialize Markdown only for save.
- Include `baseVersion`.
- Show basic conflict state.

## Required Coverage

- [x] Markdown/frontmatter baseline tests exist.
- [x] API test for stale save conflict.
- [ ] UI smoke/manual check edits and saves page.

## Done When

- Editing a page writes through `savePage`.
- A stale save cannot silently overwrite external changes.

## Progress

Temporary Markdown textarea editor exists for the first server/client loop. It saves through `savePage` with `baseVersion` and shows conflict state. ProseMirror integration is still pending.

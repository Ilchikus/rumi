---
status: verify
type: feature
milestone: M04
owner_layer: editor
coverage:
  - markdown
  - api
  - ui-smoke
created: "2026-06-22"
updated: "2026-06-23"
---
# M04-001 Editor Open Save Flow

## Goal

Connect light ProseMirror editor state to server-backed page open/save.

## Scope

- Parse server Markdown body into ProseMirror.
- Keep ProseMirror as live state.
- Serialize Markdown only for save.
- Include `baseVersion`.
- Show basic conflict state.

## Out Of Scope

- Full Rumi block editor preset.
- Slash commands, block handles, rich embeds, table chrome, and database-aware NodeViews.
- Autosave tuning beyond the current explicit save loop.

## Required Coverage

- [x] Markdown/frontmatter baseline tests exist.
- [x] API test for stale save conflict.
- [x] Editor smoke/typecheck for ProseMirror open/edit/save.
- [ ] UI smoke/manual check edits and saves page.

## Done When

- Editing a page writes through `savePage`.
- A stale save cannot silently overwrite external changes.

## Progress

Light ProseMirror now replaces the temporary textarea surface. The web app keeps Markdown/frontmatter as the runtime/API contract, marks the page dirty from ProseMirror transactions, and serializes Markdown only when saving or preserving dirty state across moves.

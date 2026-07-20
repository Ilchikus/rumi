---
status: verify
type: feature
milestone: M04
coverage:
  - markdown
  - api
  - ui-smoke
created: 2026-06-22
updated: 2026-06-23
owner_layer: editor
---
# M04-001 Editor Open Save Flow

## Goal

Connect light ProseMirror editor state to server-backed page open/save.

## Scope

- Parse server Markdown body into ProseMirror.
- Keep ProseMirror as live state.
- Serialize Markdown only for save.
- Debounce editor changes into background saves.
- Include `baseVersion`.
- Show basic conflict state.
- Render the canonical filename as the page title.
- Render YAML frontmatter as page properties above the body.
- Restore the last successfully opened page for each workspace on revisit.

## Out Of Scope

- Full Rumi block editor preset.
- Slash commands, block handles, rich embeds, table chrome, and database-aware NodeViews.
- Advanced autosave tuning and offline retry queues.

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


The editor surface now presents each file as one page: its canonical filename supplies the title, YAML frontmatter is rendered as property rows, and the Markdown body remains the ProseMirror document. Body changes save in the background after a short idle delay; revision tracking preserves edits made while a save is in flight.


The web client remembers the logical sidebar node and resolved page path per workspace, restoring normal, folder, and database pages after a refresh. Stale saved selections are discarded when their node no longer exists.

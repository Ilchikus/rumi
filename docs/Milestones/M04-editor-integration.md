---
status: doing
order: 4
areas:
  - editor
  - web
  - api
depends_on:
  - M03
created: "2026-06-22"
updated: "2026-06-23"
---
# M04 Editor Integration

## Goal

Connect a light ProseMirror editor to server-backed page open/save.

## Scope

- Parse Markdown into ProseMirror on open.
- Keep ProseMirror as live state.
- Serialize Markdown only on save.
- Save with `baseVersion`.
- Basic conflict UI.
- Markdown roundtrip tests.

## Out Of Scope

- Full Rumi block editor preset.
- Block handles, slash menu, rich embeds, custom selection toolbar, and table chrome.
- Database-aware NodeViews.

## Exit Criteria

- User can edit and autosave a page through `savePage`.
- Stale save does not silently overwrite.
- Markdown tests protect key block types.
- Editor does not serialize full Markdown on every transaction for app state.

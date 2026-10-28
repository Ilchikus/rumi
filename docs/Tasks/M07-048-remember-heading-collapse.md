---
status: verify
type: feature
milestone: M07
release: "0.1.19"
owner_layer: editor
coverage:
  - unit
  - ui-smoke
created: 2026-10-09
updated: 2026-10-09
---
# M07-048 Remember Collapsed Headings

## Goal

Collapsed headings stay collapsed when the page is reopened or reloaded, without writing anything
to the Markdown file.

## Scope

- Browser-local state, like pins and recent pages: `localStorage`, keyed by workspace and page
  path. The workspace has no per-user identity on the server.
- A heading is identified by its level and text, plus its occurrence among identical headings.
  Renaming a heading or moving the page forgets its state.
- Restored when the page opens and when it reloads after an outside change.
- No stored entry for pages without collapsed headings.

## Out Of Scope

- Syncing collapse state across browsers or devices.

## Required Coverage

- [x] Unit: collapse, recreate the editor state, and the same headings are collapsed; duplicate
      headings restore by occurrence; edited heading text forgets its state.
- [x] Browser QA: collapse, reload, still collapsed; expand, reload, expanded.

## Done When

Reopening a page shows the headings collapsed as they were left in that browser.

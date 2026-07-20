---
status: verify
type: feature
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: 2026-07-20
updated: 2026-07-20
---
# M07-007 Application Shell Address Bar

## Goal

Make workspace navigation and current-file actions feel like one calm, centered browser-style address bar.

## Delivered

- The sidebar identifies the workspace by its root-folder name without a redundant `Workspace`
  label or manual refresh control.
- The uploaded Rumi SVG is the visible workspace mark and cache-refreshed browser favicon.
- The borderless application header centers a neutral-100 address bar to the same width as the
  current editor canvas.
- The address bar contains navigable root-to-item breadcrumbs, a Command-K search affordance, and
  an empty-space search target.
- A compact current-item menu sits outside the address bar at the header's right and exposes Move
  file, Move to Trash, and See revisions through the existing runtime-backed flows.
- The revision window has a fixed, viewport-bounded size with internal scrolling, and compares the
  selected full Markdown snapshot to the current full Markdown source in a line-numbered code diff.
- Revision diff rows and counts distinguish added, removed, and unchanged lines without introducing
  a new application color palette.
- The workspace name and root breadcrumb both open the editable root homepage at `/`. The canonical
  `<workspace-root-name>.index.md` companion is preferred, with root `index.md` accepted as a
  compatibility fallback; neither homepage file is duplicated as a sidebar child.
- The browser title is only the current item name, with Markdown, folder-index, and database-config
  suffixes hidden.

## Coverage

- [x] Runtime coverage for root companion discovery, tree hiding, and root-page opening.
- [x] Component coverage for nested breadcrumbs, Trash, the neutral address bar, Command-K hint,
  and the external current-item action trigger.
- [x] Focused diff coverage for replacements, repeated lines, empty files, line-ending
  normalization, and large documents.
- [x] Typecheck and production build.
- [x] Manual browser smoke for the revisions menu action and fixed dialog bounds at a 500px-tall
  viewport.
- [ ] Manual browser smoke for breadcrumb navigation, search toggle, and the Move/Trash menu
  actions.

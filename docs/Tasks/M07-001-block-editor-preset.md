---
status: done
type: feature
milestone: M07
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
  - docs
created: "2026-06-23"
updated: "2026-07-18"
---
# M07-001 Rumi Block Editor Preset

## Goal

Assemble the official Rumi block editor preset on top of the ProseMirror foundation.

## Scope

- Extension/command registry.
- Slash commands.
- Block handles and block context menu.
- Selection toolbar.
- Rich NodeViews for code, images, files, bookmarks, Mermaid, tables, and databases.
- Themeable styling and NodeView skins.

## Out Of Scope

- Replacing ProseMirror as the editor foundation.
- Changing Markdown/frontmatter as the canonical file contract without a separate decision.
- Copying the old editor implementation directly.

## Notes

Use the old editor as behavioral reference only. Rebuild the preset around clean editor-core, editor-kit, and web adapter boundaries.

## Done When

- The light editor can be upgraded to the official block preset without changing runtime/API contracts.
- Rich block features are covered by Markdown roundtrip tests and UI smoke checks.

## Progress

The old editor's behavior has now been inventoried into `Contracts/editor-interactions.md` and
rebuilt behind smaller action, paste, NodeView, and Markdown modules. The preset includes Markdown
and slash creation, per-item block handles, bulk selection, drag/indent, full block conversion,
selection formatting with named highlights and link editing, `@` document links, collapsible
headings, code language/copy controls, lazy Mermaid preview, table row/column controls, bookmark,
file, image, and database-reference NodeViews, plus server-owned image/PDF upload and delivery.

The old flat-list model was intentionally replaced by standard nested lists. Database relations
remain out of scope pending Decision 019. The editor preset has passed unit/roundtrip coverage, the
full repository check, a production build, and an authenticated real-browser interaction smoke.

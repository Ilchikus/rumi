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
- Refactoring the migrated editor internals before functional parity is established.

## Notes

Migrate the proven editor as one functional subsystem. Keep its editing behavior intact and isolate
browser/backend differences behind adapters; refactor only after parity is established.

## Done When

- The light editor can be upgraded to the official block preset without changing runtime/API contracts.
- Rich block features are covered by Markdown roundtrip tests and UI smoke checks.

## Progress

The proven editor's schema, Markdown pipeline, key bindings, input rules, interaction plugins,
NodeViews, and styling now run inside the new web client. The preset includes Markdown and slash
creation, per-item block handles, bulk and area selection, block-gap drag/reorder with optional
rightward list indentation, block conversion, selection formatting, link editing, `@` document
links, collapsible headings, code and Mermaid controls, table controls, and bookmark, file, image,
and database NodeViews.

Electron and direct-filesystem dependencies were replaced with client adapters for internal
navigation, asset URLs/uploads, messages, and the new database API. The flat-list indent model is
kept during this parity phase and still serializes to nested Markdown. Database relations remain out
of scope pending Decision 019. Unit/roundtrip tests, production build, and real-browser drag,
indent, gutter-handle, slash-menu, and autosave checks cover the migrated integration.

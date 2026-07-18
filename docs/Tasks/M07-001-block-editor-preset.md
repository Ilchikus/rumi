---
status: verify
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

The official preset now includes slash commands, block handles and drag reorder, a block context
menu, selection formatting, task checkboxes, GFM tables, code/Mermaid source blocks, images/links,
and Markdown roundtrip coverage. Rich file/bookmark/database embeds and automated browser smoke
checks remain before this task can move from `verify` to `done`.

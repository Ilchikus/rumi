---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
  - docs
created: 2026-07-20
updated: 2026-07-20
---
# M07-004 Unified Page And Database Record Editor

## Goal

Keep ordinary pages and database records on one editor surface, while routing shared record
properties through the owning database schema.

## Scope

- Use the same title, properties panel, block editor, menus, and save behavior for pages and records.
- Let a record create a database property from its page view.
- Add that property to the database schema and primary view before showing it as an empty record field.
- Keep ordinary page properties as portable YAML without database schema metadata.
- Use one default yellow `==highlight==` mark with no color picker or colored source syntax.
- Restore block-handle menu background, add-block control, click selection, padding, and marquee behavior.
- After inserting a database embed, immediately choose its source from the database folders in the
  current workspace using the styled source menu. Embedded database toolbars show that source as a
  link to the original database and use the same menu to change it later.

## Required Coverage

- [x] UI tests cover ordinary-page and database-record property creation affordances.
- [x] Shared schema helper tests cover the property definition and primary-view update.
- [x] Markdown tests cover canonical yellow highlight serialization and legacy color normalization.
- [x] Editor coverage verifies database source options use logical database-folder paths.
- [ ] Manual browser check covers handle click, add, drag, context menu, and padding marquee selection.

## Done When

- A database record looks and behaves like an ordinary page.
- Creating a property from a record page updates the database schema rather than creating a private
  YAML-only field.
- All requested editor interactions run in the active `apps/web` client.

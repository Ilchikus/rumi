---
status: done
order: 8
areas:
  - database
  - runtime
  - api
  - web
  - editor
depends_on:
  - M06
  - M07
created: 2026-07-23
updated: 2026-07-23
---
# M08 Database Views And Filters

## Goal

Make database views real shared configurations, with multiple table views, nested saved filters,
independent property visibility, and the same behavior on full database pages and embeds.

## Scope

- Canonical view IDs, exact visible columns, nested filter groups, and record-page visibility in
  `.db.md`.
- Runtime-owned filter evaluation and versioned view/visibility/property-create commands.
- API and headless-client support for querying and mutating a selected view.
- Shared view tabs and filter builder for full-page and embedded databases.
- Independent table-view and record-page property visibility.
- Shared keyboard-first property-create menu.

## Out Of Scope

- Board, calendar, gallery, or list view rendering.
- Global smart/query views across database folders.
- View permissions or per-user shared view state.
- View reordering.

## Exit Criteria

- Two table views of one database can retain different visible columns, nested filters, and sorts.
- A saved view produces the same records on the full database page and every embed that selects it.
- Renaming/deleting properties or select options cannot leave broken nested filter references.
- Hiding a table column does not affect an opened record, and hiding a record-page property does not
  affect any table.
- Runtime roundtrip tests, API contract tests, editor Markdown tests, and focused UI smoke coverage
  protect the behavior.

## Delivered

Stable same-type views, exact per-view columns, saved nested filters and sorts, typed runtime/API
commands, shared full-page/embed tabs, independent record-page visibility, and the shared
keyboard-first property menu are implemented. Filter edits remain local until Apply, table
visibility lives only in column header actions, and table selection controls use the outer
interaction gutter. Full typecheck, all 241 automated tests, production builds, and browser smoke
on a disposable workspace passed.

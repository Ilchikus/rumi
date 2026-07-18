---
status: done
order: 6
areas:
  - database
  - runtime
  - web
depends_on:
  - M01
  - M04
  - M05
created: "2026-06-22"
updated: "2026-07-18"
---
# M06 Databases

## Goal

Rebuild folder-backed databases as server-owned domain behavior.

## Scope

- Create database folder.
- Read/write `.db.md` schema and views.
- Create record.
- Update record property.
- Query records with filter/sort.
- Basic table UI.

## Exit Criteria

- UI does not manually coordinate frontmatter writes and SQLite updates.
- Runtime tests cover schema and record operations.
- Database page can show rich body plus query view.

## Delivered

The runtime and API own folder/config creation, records, typed property updates, schema updates,
property rename migration, indexed query/filter/sort, and normalized database events. The official
client renders a database's rich page body alongside an editable table. Relation properties are
explicitly deferred to proposed Decision 019; unknown future property definitions are preserved.

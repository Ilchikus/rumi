---
status: idea
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
updated: "2026-06-22"
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

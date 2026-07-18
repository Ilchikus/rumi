---
status: done
type: feature
milestone: M06
owner_layer: database
coverage:
  - runtime
  - api
created: "2026-06-22"
updated: "2026-07-18"
---
# M06-001 Folder-Backed Database Runtime

## Goal

Move database behavior into runtime commands.

## Scope

- Create database folder and `.db.md`.
- Read schema/views from `.db.md`.
- Create record Markdown file.
- Update record property in frontmatter.
- Query database records from index or files.

## Required Coverage

- [x] Runtime test creates database.
- [x] Runtime test creates record.
- [x] Runtime test updates record property.
- [x] Runtime test renames property across schema, views, and records.
- [x] API test for query response.
- [x] Runtime test preserves unsupported future property definitions.

## Done When

- Database UI no longer needs to coordinate raw file writes plus index writes.

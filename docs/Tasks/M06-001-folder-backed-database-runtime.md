---
status: idea
type: feature
milestone: M06
owner_layer: database
coverage:
  - runtime
  - api
created: "2026-06-22"
updated: "2026-06-22"
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

- [ ] Runtime test creates database.
- [ ] Runtime test creates record.
- [ ] Runtime test updates record property.
- [ ] Runtime test renames property later.
- [ ] API test for query response.

## Done When

- Database UI no longer needs to coordinate raw file writes plus index writes.

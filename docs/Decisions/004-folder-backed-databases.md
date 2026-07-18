---
status: accepted
areas:
  - database
  - files
  - web
impact: high
created: 2026-06-22
updated: 2026-06-22
---
# Folder-Backed Databases

## Decision

Keep Rumi's primary database model:

```text
database = folder-backed collection
record = Markdown file inside that folder
schema/views = Database.db.md
record values = frontmatter
```

## Why

This is stronger for Rumi than treating all databases as global filtered views.

A database is a real workspace object:

- It has a location.
- It has children.
- It has schema.
- It has views.
- It has a rich page body.
- Records are still portable Markdown files.

## Consequences

- Database UI should call server-side domain commands.
- `.db.md` frontmatter stores schema/views.
- Record frontmatter stores values.
- Smart/query views can be added later as a second concept.

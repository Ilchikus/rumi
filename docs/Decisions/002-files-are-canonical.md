---
status: accepted
areas:
  - files
  - database
  - index
impact: high
created: "2026-06-22"
updated: "2026-06-22"
---
# Files Are Canonical

## Decision

Markdown files with YAML frontmatter remain the canonical user content.

SQLite is a rebuildable index/cache, not the source of truth.

## Why

This keeps the "file over app" ideology intact:

- User trust.
- Easy backup.
- External editor compatibility.
- Clear recovery if Rumi is unavailable.
- Strong local-first story.

## Consequences

- Runtime commands write files first, then update indexes.
- Indexes must be rebuildable from disk.
- Browser storage is cache or UI state only.
- Postgres is not the first local source-of-truth.

## Later

Richer storage can be explored later through the server boundary, but the first rebuild should preserve plain-file compatibility.

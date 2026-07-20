---
status: done
type: feature
milestone: M07
owner_layer: runtime
coverage:
  - runtime
  - api
  - cli
created: "2026-07-18"
updated: "2026-07-18"
---
# M07-002 Server Indexed Search

## Goal

Search title, path, frontmatter, and body through the server-owned persistent index.

## Delivered

- Persisted document index under `.rumi/index.json` with canonical Markdown remaining authoritative.
- Rebuild and incremental runtime paths shared by commands and watcher reconciliation.
- Exact-title, title-prefix, path, frontmatter, and body ranking.
- Typed HTTP API and API client method.
- CLI search command with human and JSON output.
- Lazy-loaded web search dialog with keyboard navigation and kind filters.

## Coverage

- [x] Exact title ranks before prefix/content matches.
- [x] Index survives runtime reopen.
- [x] External watcher changes update search before events publish.
- [x] API response shape is covered.

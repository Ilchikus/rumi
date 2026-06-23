---
status: done
order: 1
areas:
  - runtime
  - index
depends_on: []
created: "2026-06-22"
updated: "2026-06-22"
---
# M01 Runtime Foundation

## Goal

Create the Workspace Runtime as the center of the product.

## Scope

- Workspace root handling.
- File model conventions.
- Open workspace.
- Read tree.
- Open page.
- Save page with version/hash.
- Temp-dir runtime tests.

## Out Of Scope

- Full web UI.
- Databases beyond recognizing `.db.md`.
- Git/revisions.
- True watcher.

## Exit Criteria

- Runtime can open a temp workspace.
- Runtime can read tree and page content.
- Runtime can save page safely with stale-write detection.
- Tests cover the above without HTTP or browser.

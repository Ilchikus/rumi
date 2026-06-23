---
status: active
order: 5
areas:
  - watcher
  - index
  - runtime
depends_on:
  - M01
  - M02
created: "2026-06-22"
updated: "2026-06-23"
---
# M05 Watcher Index Reconciliation

## Goal

Make external file edits safe and visible.

## Scope

- Server-side watcher.
- Debounced reconciliation.
- SQLite index updates.
- Normalized events.
- `rumi reconcile`.
- `rumi index`.

## Progress

The first watcher slice is implemented as server-side debounced reconciliation against an in-memory snapshot. It emits normalized events for external edits, creates, deletes, and likely moves. SQLite index updates and persistent reconciliation memory are still pending.

## Exit Criteria

- External edit updates index and notifies client.
- External rename/move is detected best-effort with fingerprints.
- Raw watcher events are never exposed as product events.
- Rebuild/index command is repeatable.

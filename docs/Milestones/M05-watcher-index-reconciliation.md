---
status: done
order: 5
areas:
  - watcher
  - index
  - runtime
depends_on:
  - M01
  - M02
created: "2026-06-22"
updated: "2026-07-18"
---
# M05 Watcher Index Reconciliation

## Goal

Make external file edits safe and visible.

## Scope

- Server-side watcher.
- Debounced reconciliation.
- Persisted index updates.
- Normalized events.
- `rumi reconcile`.
- `rumi index`.

## Progress

The server watcher debounces raw file events into normalized Rumi events for external edits, creates,
deletes, and likely moves. A persistent JavaScript index under `.rumi/index.json` is rebuilt on open
or command and updated before reconciled events are published. Search and database queries read the
server-owned index; runtime tests cover watcher-to-index synchronization and repeatable rebuilds.

## Exit Criteria

- External edit updates index and notifies client.
- External rename/move is detected best-effort with fingerprints.
- Raw watcher events are never exposed as product events.
- Rebuild/index command is repeatable.

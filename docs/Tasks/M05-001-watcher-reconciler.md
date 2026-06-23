---
status: verify
type: foundation
milestone: M05
owner_layer: watcher
coverage:
  - runtime
  - cli
  - api
created: "2026-06-22"
updated: "2026-06-23"
---
# M05-001 Watcher Reconciler

## Goal

Handle external file changes as reconciled workspace updates.

## Scope

- Watch workspace server-side.
- Debounce raw filesystem events.
- Rescan the workspace into an in-memory snapshot.
- Emit normalized events.
- Provide manual `reconcile` command.

## Out Of Scope

- SQLite index writes.
- Persistent reconciliation memory across server restarts.
- Reference repair after external moves.

## Required Coverage

- [x] Runtime test for external file edit.
- [x] Runtime test for add/delete.
- [x] Runtime test for atomic write style replacement.
- [x] Runtime test for likely move detection with hash/fingerprint.

## Progress

The runtime now owns a debounced filesystem watcher and a deterministic snapshot reconciler. External page edits publish `page.changed`; external page creates/deletes publish page events plus `workspace.treeChanged`; likely file moves are matched by unique content fingerprint and publish `page.moved`.

The Fastify server starts the watcher automatically, and `rumi reconcile` exposes the same reconciler manually for development/debugging.

## Done When

- Connected clients get normalized events instead of raw watcher noise.

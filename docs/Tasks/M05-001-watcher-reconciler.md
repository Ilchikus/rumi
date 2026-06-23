---
status: idea
type: foundation
milestone: M05
owner_layer: watcher
coverage:
  - runtime
created: "2026-06-22"
updated: "2026-06-22"
---
# M05-001 Watcher Reconciler

## Goal

Handle external file changes as reconciled workspace updates.

## Scope

- Watch workspace server-side.
- Debounce raw filesystem events.
- Rescan affected path or parent.
- Update index state.
- Emit normalized events.
- Provide manual `reconcile` command.

## Required Coverage

- [ ] Runtime test for external file edit.
- [ ] Runtime test for add/delete.
- [ ] Runtime test for atomic write style replacement.
- [ ] Runtime test for likely move detection with hash/fingerprint.

## Done When

- Connected clients get normalized events instead of raw watcher noise.

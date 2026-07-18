---
status: accepted
areas:
  - server
  - files
impact: high
created: "2026-06-22"
updated: "2026-07-18"
---
# Defer Git And Revisions

## Decision

Do not bring current Git/GitHub sync into the first server runtime.

## Defer

- Git auto-init.
- Git commits on save.
- Revision modal.
- GitHub remote sync.
- Pull/push conflict UI.

## Why

Git was useful for revisions and multi-device thinking, but it adds too much complexity before the workspace runtime is solid.

## Later Options

- Append-only snapshot log.
- SQLite-backed revision metadata.
- File snapshots in `.rumi/revisions/`.
- Optional Git integration as export/sync.

Git should not define runtime architecture.

## Follow-Up

The first-runtime deferral is complete. Decision 017 accepts and implements Rumi-owned document
snapshots. Git remains optional future application-independent backup/export infrastructure and is
not used for document history or synchronization.

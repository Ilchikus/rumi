---
status: accepted
areas:
  - server
  - watcher
  - index
  - files
impact: high
created: "2026-06-22"
updated: "2026-06-22"
---
# Server-Owned Watcher And Index

## Decision

File watching and indexing are server responsibilities.

Watcher events are hints, not truth.

## Flow

```text
raw filesystem event
  -> debounce affected path/area
  -> rescan affected path or parent
  -> compare with indexed state
  -> update SQLite/index
  -> emit normalized Rumi events
```

## Why

Browser local file watching is not portable enough. Filesystems also differ across macOS, Linux, Docker, and network mounts. Some editors write files atomically.

## Consequences

- Client subscribes to normalized events.
- Client does not infer truth from raw watcher behavior.
- CLI should provide `rumi index` and `rumi reconcile`.
- Index rebuild must be safe and repeatable.

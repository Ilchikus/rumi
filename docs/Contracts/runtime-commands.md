---
status: draft
area: runtime
owner: runtime
created: "2026-06-22"
updated: "2026-06-23"
---
# Runtime Commands

The runtime exposes product intent.

Initial commands:

```text
openWorkspace
getTree
openPage
savePage
createPage
createFolder
createDatabase
renameNode
moveNode
deleteNode
queryDatabase
updateRecordProperty
searchWorkspace
reconcileWorkspace
rebuildIndex
```

Commands own side effects:

- File writes.
- Index updates.
- Reference repair.
- Event emission.
- Conflict detection.

## Event Bus

Runtime exposes a typed event bus for normalized Rumi events.

Commands publish only after their durable side effect succeeds. For example, `savePage` writes the Markdown file and then publishes `page.changed`.

Transport layers subscribe to the bus; runtime code does not know whether listeners are SSE, WebSocket, CLI, tests, or future agents.

Low-level file operations are internal helpers, not the main public surface.

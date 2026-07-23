---
status: draft
area: runtime
owner: runtime
created: 2026-06-22
updated: 2026-07-23
---
# Runtime Commands

The runtime exposes product intent.

Initial commands:

```text
openWorkspace
getTree
readAsset
saveAsset
openPage
savePage
createPage
createFolder
createDatabase
createDatabaseRecord
createDatabaseProperty
updateDatabaseRecordProperty
updateDatabaseSchema
createDatabasePropertyOption
renameDatabaseProperty
createDatabaseView
updateDatabaseView
deleteDatabaseView
setDatabaseRecordPagePropertyVisibility
renameNode
moveNode
deleteNode
listTrash
restoreTrashItem
queryDatabase
updateRecordProperty
searchWorkspace
checkpointNow
listRevisions
getRevision
restoreRevision
reconcileWorkspace
rebuildIndex
```

`queryDatabase` may resolve one saved database view by its stable view ID. Saved filters and sorts
are runtime behavior; clients do not evaluate or flatten grouped filters. Optional transient query
filters are combined with the saved filter root through `and`.

Database view, property creation, and visibility commands are versioned against the `.db.md`
schema. They preserve unsupported future schema/view definitions and publish
`database.schemaChanged` only after the canonical file write succeeds.

Commands own side effects:

- File writes.
- Index updates.
- Reference repair.
- Event emission.
- Conflict detection.
- Snapshot checkpoints for canonical Markdown content.
- Collision-safe create, rename, move, restore, and `.assets/` names. Occupied destinations receive
  the next available parenthesized suffix (`Name (1)`, `Name (2)`, and so on) and current content is
  never overwritten.
- Portable safe deletion under `.rumi/trash/`, original-path metadata, collision-safe restore, and
  revision-object continuity.

`deleteNode` never permanently removes user content. Folder and database deletion still requires
recursive confirmation, then the complete payload is moved atomically into Trash. `listTrash`
returns display metadata without exposing internal payload paths. `restoreTrashItem` recreates
missing parents, never overwrites an occupied path, updates indexes, and publishes
`workspace.treeChanged` after the restored payload is durable.

`renameNode` and `moveNode` choose an available destination, then update the target's filesystem
path, revision identity, and search entry before returning the actual path. They run reference repair
as tracked background work so large workspaces do not block the client. Repair covers known Markdown
links and mentions in body and frontmatter, preserves custom labels, checkpoints each page before
rewriting it, refreshes its search entry, and publishes `page.changed` with
`changedBy: "reference-repair"`.

## Event Bus


Runtime exposes a typed event bus for normalized Rumi events.


Commands publish only after their durable side effect succeeds. For example, `savePage` writes the Markdown file and then publishes `page.changed`.


Transport layers subscribe to the bus; runtime code does not know whether listeners are SSE, WebSocket, CLI, tests, or future agents.


Low-level file operations are internal helpers, not the main public surface.


The persistent SQLite index and Rumi revision store are runtime internals. HTTP routes, the official web client, and the CLI do not coordinate raw file/index/history writes themselves.

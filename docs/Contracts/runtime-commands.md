---
status: draft
area: runtime
owner: runtime
created: 2026-06-22
updated: 2026-08-22
---
# Runtime Commands

The runtime exposes product intent.

Initial commands:

```text
openWorkspace
getWorkspaceSettings
updateWorkspaceSettings
getTree
readAsset
saveAsset
saveAssetStream
listAssets
openPage
savePage
updateImagePresentation
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
openTrashPage
restoreTrashItem
deleteTrashItem
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
- Atomic workspace-setting writes that preserve unrelated `.rumi/config.json` domains and update
  the live upload policy.
- Atomic shared image-width/alignment writes to `.rumi/presentation.json`, independently versioned from
  Markdown content and cached by the runtime for page-open reads.
- Streamed asset writes that enforce the live size policy while bytes arrive, validate the complete
  file, and atomically publish only complete uploads. SVG validation parses the full XML document
  and accepts only static content without scripts, event handlers, animation, embedded documents,
  or external resource references.
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

`listAssets` inventories supported regular files recursively beneath the canonical `.assets/`
directory without reading their contents. It returns only workspace-relative path, file name,
content type, byte size, and modified time, ordered by modified time descending and then path
ascending. Missing `.assets/` directories produce an empty inventory. Hidden entries, unsupported
extensions, symlinks at any path segment, and non-files are excluded; unexpected permission and I/O
errors are reported instead of returning a silently partial inventory. Files added or removed by
external tools are reflected by the next command call.

`deleteNode` never permanently removes user content. Folder and database deletion still requires
the explicit recursive command flag, then the complete payload is moved atomically into Trash. `listTrash`
returns display metadata without exposing internal payload paths. `openTrashPage` safely reads a
page, folder index, or database page from one Trash payload for read-only display.
`restoreTrashItem` recreates missing parents, never overwrites an occupied path, updates indexes,
and publishes `workspace.treeChanged` after the restored payload is durable. `deleteTrashItem`
permanently removes one Trash payload and its metadata, then publishes `trash.changed`.

`renameNode` and `moveNode` choose an available destination, then update the target's filesystem
path, revision identity, shared presentation paths, and search entry before returning the actual path. They run reference repair
as tracked background work so large workspaces do not block the client. Repair covers known Markdown
links and mentions in body and frontmatter, preserves custom labels, checkpoints each page before
rewriting it, refreshes its search entry, and publishes `page.changed` with
`changedBy: "reference-repair"`. The same repair runs when the watcher can identify an external
asset rename uniquely by fingerprint.

## Event Bus


Runtime exposes a typed event bus for normalized Rumi events.


Commands publish only after their durable side effect succeeds. For example, `savePage` writes the Markdown file and then publishes `page.changed`.


Transport layers subscribe to the bus; runtime code does not know whether listeners are SSE, WebSocket, CLI, tests, or future agents.


Low-level file operations are internal helpers, not the main public surface.


The persistent SQLite index and Rumi revision store are runtime internals. HTTP routes, the official web client, and the CLI do not coordinate raw file/index/history writes themselves.

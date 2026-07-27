---
status: draft
area: events
owner: server
created: "2026-06-22"
updated: "2026-07-20"
---
# Server Events

Events are normalized Rumi events, not raw filesystem events.

Initial event names:

```text
workspace.treeChanged
page.changed
page.moved
page.deleted
folder.childrenChanged
database.schemaChanged
database.recordsChanged
asset.changed
index.rebuilt
server.statusChanged
```

Example:

```text
page.changed {
  path,
  version,
  contentHash,
  changedBy,
  sourceClientId,
  affects: ["frontmatter", "body", "links"]
}
```

Clients use events to invalidate the right queries, not to reconstruct filesystem truth.

Background reference repair publishes `page.changed` for every referring page it rewrites, with
`changedBy: "reference-repair"` and:

```text
referenceRepair: { previousPath, nextPath }
affects: ["body", "frontmatter", "links", "search"]
```

An open clean page refetches normally. An open dirty page applies the same deterministic reference
rewrite to its local draft and advances its base version, avoiding a false conflict or loss of local
editing.

Moving content to Trash publishes `page.deleted` with `changedBy: "trash.move"` and the recoverable
`trashItemId`. An open page transitions to a muted read-only Trash view instead of disappearing.
Restoring from Trash publishes `workspace.treeChanged` with the restored path, original path in
`previousPath`, and `changedBy: "trash.restore"`.

## Transport

First transport:

```text
GET /api/events
```

The route uses Server-Sent Events.

Each Rumi event is sent with:

```text
id: <monotonic runtime event id>
event: <Rumi event name>
data: <JSON RumiEvent>
```

Clients may listen to individual named events such as `page.changed`, or use the default message handler if the server later emits generic messages.

## Page Changed MVP

`savePage` publishes `page.changed` only after a successful write.

Stale/conflict saves do not publish `page.changed`.

The official client behavior is optimistic reconciliation:

- Always refresh the tree on `page.changed`.
- If the changed page is open and the editor is clean, refetch the page.
- If the changed page is open and the editor is dirty, refetch the new base, retain locally dirty
  fields, advance the base version, and autosave again without a conflict notification.
- A stale save response triggers the same refetch/rebase flow with bounded retries. It never disables
  the live editor.

## Watcher Reconciliation

The server starts a runtime-owned filesystem watcher for the served workspace. Raw watcher events are debounced and reconciled against an in-memory workspace snapshot before anything is published.

Runtime-owned writes are recorded by path and resulting content hash. Matching watcher observations
advance the snapshot without publishing a duplicate `filesystem` event.

Watcher-originated events use the same event names as runtime commands:

- External page content edits publish `page.changed` with `changedBy: "filesystem"`.
- External page creates publish `page.changed` and `workspace.treeChanged`.
- External page deletes publish `page.deleted` and `workspace.treeChanged`.
- Likely external file moves are matched by unique content fingerprint and publish `page.moved` plus `workspace.treeChanged`.

The current watcher snapshot is in-memory only. Persistent index updates remain part of the later SQLite/index slice.

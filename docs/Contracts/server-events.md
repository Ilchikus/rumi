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

Moving content to Trash publishes the existing `page.deleted` invalidation event. Restoring from
Trash publishes `workspace.treeChanged` with the restored path, original path in `previousPath`, and
`changedBy: "trash.restore"`. Clients refresh both the workspace tree and Trash listing for these
events.

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

The first client behavior is invalidation/refetch:

- Always refresh the tree on `page.changed`.
- If the changed page is open and the editor is clean, refetch the page.
- If the changed page is open and the editor is dirty, keep the local draft and show a conflict/refresh notice.

## Watcher Reconciliation

The server starts a runtime-owned filesystem watcher for the served workspace. Raw watcher events are debounced and reconciled against an in-memory workspace snapshot before anything is published.

Watcher-originated events use the same event names as runtime commands:

- External page content edits publish `page.changed` with `changedBy: "filesystem"`.
- External page creates publish `page.changed` and `workspace.treeChanged`.
- External page deletes publish `page.deleted` and `workspace.treeChanged`.
- Likely external file moves are matched by unique content fingerprint and publish `page.moved` plus `workspace.treeChanged`.

The current watcher snapshot is in-memory only. Persistent index updates remain part of the later SQLite/index slice.

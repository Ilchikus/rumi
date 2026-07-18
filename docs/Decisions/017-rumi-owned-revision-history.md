---
status: accepted
areas:
  - runtime
  - files
  - watcher
  - editor
  - web
impact: high
created: "2026-07-02"
updated: "2026-07-18"
---
# Rumi-Owned Object Identity And Revision History

## Decision

Build revision history as a Rumi-owned restore system, not as Git commits.

Introduce internal Rumi object identity as the layer above revision history. Revisions attach to `objectId`; snapshots are stored by `contentHash`.

Use content-addressed full snapshots for checkpoint contents, deduped by content hash. Compute diffs on read for the revision UI.

Do not checkpoint on every save. Saves update the current canonical file. Revisions capture meaningful restore points.

## Implemented MVP

The accepted page-level slice is implemented in the runtime, API, CLI, and official web client:

- internal object identity and path continuity for Rumi-controlled moves;
- content-addressed Markdown blobs and append-only JSONL events under `.rumi/`;
- baseline, idle, manual, pre-delete, pre-restore, and restore checkpoints;
- deduplication by content hash and pending-checkpoint flush on graceful shutdown;
- revision list/content/checkpoint/restore API commands;
- `rumi snapshot` and `rumi history`;
- a page history dialog with current-versus-snapshot comparison and safe restore.

Deleted-object restore, rich line-level diff highlighting, folder/database restore, retention, and
binary asset history remain deferred as described below.

## Why

Rumi's canonical user content is still Markdown files. Revision history should protect those files without making Git, branches, staging, remotes, or merge state part of the core product path.

Git remains useful later as optional backup/sync/export infrastructure, but it should not define the runtime architecture or the restore UI.

Storing diffs as the durable format sounds smaller, but it makes restore correctness harder. Full snapshots are easier to verify, easier to restore, and easier to debug. Deduplication and checkpoint policy keep them lightweight enough for Markdown.

Object identity is useful beyond revisions. The same internal ID can support rename/move continuity, deleted-item restore, search/index continuity, recently opened state, backlinks/reference repair, database records for page-backed items, future sync/conflict handling, and later collaboration/history features.

## Principles

- Current Markdown files are truth.
- Object identity is internal operational memory, not user-facing file content.
- Revision history is a safety layer, not the canonical document store.
- Revision capture is server/runtime-owned.
- Raw watcher events are hints; reconciled content hashes are facts.
- Restore creates a new current version; it does not erase later history.
- The UI shows diffs, but the storage layer does not depend on diffs.
- No required object IDs or revision IDs are written into Markdown files.

## Identity Model

Use four separate concepts:

```text
objectId = internal identity of a logical Rumi item
path = current user-facing location/name
contentHash = exact content snapshot identity
revisionId = one historical event/checkpoint
```

Object identity is an object timeline, not a path timeline:

```text
objectId obj_1
  created at Ideas.md
  checkpoint contentHash=h1 at Ideas.md
  checkpoint contentHash=h2 at Ideas.md
  moved from Ideas.md to Archive/Ideas.md
  checkpoint contentHash=h3 at Archive/Ideas.md
  deleted at Archive/Ideas.md
  restored from h2 at Archive/Ideas.md
```

Paths can change. Content can change. The `objectId` lets Rumi understand that this is still the same logical item when the identity match is known.

## Content Roles

Not every Rumi object maps to one visible Markdown file path.

Revision records should store both object location and content location:

```json
{
  "objectId": "obj_01J...",
  "objectPath": "Projects",
  "contentPath": "Projects/Projects.index.md",
  "contentRole": "folder-index",
  "contentHash": "abc123"
}
```

Initial content roles:

- `page`: normal Markdown page content, such as `Ideas.md`.
- `folder-index`: folder companion content, such as `Projects/Projects.index.md`.
- `database-config`: database companion content, such as `Tasks/Tasks.db.md`.

Binary asset history is separate and deferred.

## Storage Model

Keep object and revision data under `.rumi/`, hidden from the workspace tree.

```text
.rumi/
  objects/
    events.jsonl
    path-index.json
  revisions/
    events.jsonl
    blobs/
      sha256/
        ab/
          abc123....md
```

Durable logs:

- `.rumi/objects/events.jsonl`: append-only object identity events.
- `.rumi/revisions/events.jsonl`: append-only revision/checkpoint/restore events.
- `.rumi/revisions/blobs/sha256/...`: unique Markdown snapshots by content hash.

Rebuildable cache:

- `.rumi/objects/path-index.json`: current path/content path to object ID lookup.

`path-index.json` exists for fast runtime lookup. It should be recoverable from object events plus a workspace scan.

Example object event:

```json
{
  "eventId": "evt_01J...",
  "type": "object.created",
  "objectId": "obj_01J...",
  "kind": "page",
  "path": "Decisions/017-rumi-owned-revision-history.md",
  "contentPath": "Decisions/017-rumi-owned-revision-history.md",
  "contentRole": "page",
  "createdAt": "2026-07-02T00:00:00.000Z"
}
```

Example move event:

```json
{
  "eventId": "evt_01J...",
  "type": "object.moved",
  "objectId": "obj_01J...",
  "previousPath": "Old.md",
  "path": "New.md",
  "previousContentPath": "Old.md",
  "contentPath": "New.md",
  "confidence": "certain",
  "createdAt": "2026-07-02T00:00:00.000Z"
}
```

Example checkpoint revision:

```json
{
  "revisionId": "rev_01J...",
  "type": "revision.checkpoint",
  "objectId": "obj_01J...",
  "objectPath": "Decisions/017-rumi-owned-revision-history.md",
  "contentPath": "Decisions/017-rumi-owned-revision-history.md",
  "contentRole": "page",
  "reason": "idle-checkpoint",
  "source": "editor",
  "createdAt": "2026-07-02T00:00:00.000Z",
  "contentHash": "abc123",
  "previousContentHash": "def456",
  "version": "abc123"
}
```

Blobs are keyed by `contentHash`, not by `objectId`:

```text
.rumi/revisions/blobs/sha256/ab/abc123....md
```

This keeps dedupe and integrity simple. Revision metadata is object-centric; blob storage is content-centric.

## Identity Confidence

Rumi must not silently merge histories when identity is uncertain.

Object events should carry a confidence signal when identity is inferred:

- `certain`: operation came through a Rumi runtime command.
- `probable`: watcher saw remove/add with the same unique fingerprint or content hash.
- `ambiguous`: offline or external change could match multiple objects.

Rules:

- Rumi command create/rename/move/delete uses `certain`.
- External edit at the same known path keeps the same `objectId`.
- External move while server is watching may keep the same `objectId` if the fingerprint match is unique.
- Ambiguous offline rename/create should create a new object or surface a repair choice later; it should not silently splice histories.

## Checkpoint Policy

Use a coalesced checkpoint coordinator per object.

Recommended defaults:

- Capture a baseline before the first known edit in a server session when the current content hash is not already recorded.
- Mark a page active when `savePage`, watcher reconciliation, or future collaboration events observe a content change.
- After activity goes quiet for 10 seconds, create a checkpoint only if at least 60 seconds passed since the last checkpoint for that object.
- If editing continues without a quiet period, force a checkpoint every 5 minutes.
- Always checkpoint current content before destructive operations:
  - delete
  - restore
  - conflict overwrite
  - future bulk move/reference repair if it rewrites content
- On graceful server shutdown, flush pending checkpoints.
- On server startup/reconcile, record `observed-offline-change` when current content differs from the last recorded hash.

Server stop is helpful but not sufficient. The idle and periodic checkpoints are the actual reliability mechanism because processes can crash or be killed.

If a checkpoint sees the same content hash as the latest checkpoint, skip it.

## Runtime Flow

For editor saves:

```text
savePage
  -> validate baseVersion
  -> write canonical Markdown file
  -> resolve objectId from contentPath/path-index
  -> notify revision coordinator of content activity
  -> publish page.changed
```

For watcher changes:

```text
raw filesystem event
  -> debounce/reconcile
  -> detect page.changed/page.moved/page.deleted
  -> resolve or infer objectId
  -> append object event if path identity changed
  -> notify revision coordinator if content changed
  -> publish normalized Rumi events
```

For restore:

```text
restoreRevision
  -> checkpoint current content first
  -> read selected snapshot blob
  -> write canonical Markdown file through runtime command path
  -> append restore event
  -> publish page.changed
```

Restoring should never delete the revision being restored from, and it should never make the selected revision become "the past again" invisibly. The restore is a new event in the timeline.

## Write Order

For a checkpoint:

```text
write blob by contentHash
  -> fsync/close blob
  -> append revision event
  -> update path-index cache
```

An orphan blob is harmless. A revision event pointing to a missing blob is bad. Blob first.

For a Rumi-controlled move:

```text
rename/move canonical file
  -> append object.moved event
  -> update path-index cache
  -> publish page.moved
```

For restore:

```text
checkpoint current content first
  -> write restored content to canonical file
  -> append revision.restored event
  -> update path-index cache
  -> publish page.changed
```

## Restore Semantics

First-class MVP restore should be page-level.

Folder/database restore can come later because it needs multi-file previews, missing/deleted file handling, companion files, and reference repair.

Page restore rules:

- If the current editor has unsaved local changes, ask before restoring.
- Before restore, checkpoint current disk content.
- Restore writes a new current file version.
- Restored content keeps the current path unless the user explicitly restores a deleted/moved object.
- A restored deleted page should recreate the file at the selected path if the parent still exists.
- If the target path now belongs to a different object, require an explicit "restore as copy" or "replace current file" choice.

Restore event:

```json
{
  "revisionId": "rev_01J...",
  "type": "revision.restored",
  "objectId": "obj_01J...",
  "restoredFromRevisionId": "rev_01H...",
  "objectPath": "Archive/Ideas.md",
  "contentPath": "Archive/Ideas.md",
  "contentRole": "page",
  "contentHash": "abc123",
  "createdAt": "2026-07-02T00:00:00.000Z"
}
```

## Diff UI

Diffs are generated on demand:

```text
current Markdown snapshot
  vs
selected revision blob
```

The UI should show:

- Revision timeline.
- Reason/source labels such as `manual-save`, `idle-checkpoint`, `filesystem`, `restore`, `delete`.
- Current version marker.
- Side-by-side or unified diff.
- Restore action with clear text: "Restore creates a new revision first."

The old Git-backed revision UI is useful as behavioral reference only. Do not copy its Git assumptions into the new runtime.

## API Shape

Likely runtime commands:

```text
getObject(path)
listRevisions(path)
getRevision(revisionId)
diffRevision(revisionId, targetPath?)
restoreRevision(revisionId, options)
checkpointNow(path, reason)
```

Likely event names:

```text
object.created
object.moved
object.deleted
revision.created
revision.restored
```

These events are optional for the first UI; page events remain the primary way clients refresh visible content.

## Retention

MVP can keep all checkpoints because the policy avoids noisy every-save snapshots and blobs are deduped.

Later retention should be workspace-configurable:

- Keep all explicit/user checkpoints.
- Keep recent automatic checkpoints densely.
- Thin older automatic checkpoints by time, for example hourly then daily.
- Enforce a workspace revision byte budget only after showing what would be removed.
- Garbage collect blobs only when no revision event references them.

Never delete restore/delete/baseline metadata without an explicit maintenance operation.

## Limitations

If the server is not running, Rumi cannot capture intermediate edits. On next startup/reconcile it can only record the newly observed state.

Best-effort external move detection depends on fingerprints. Ambiguous moves may start a new revision object instead of preserving the old timeline.

Binary asset history is separate. This proposal is for Markdown-backed pages, folder companions, and database config pages.

## Deferred

- Git integration.
- Remote backup/sync.
- Folder/database restore.
- Binary asset revision history.
- Separate aliases log for old path redirects.
- Per-block history.
- CRDT operation history.
- Branching/version labels.
- Rich retention UI.

## Open Questions

- Should object identity be split into its own accepted decision before this revision proposal is accepted?
- Should automatic checkpoint timing be workspace-configurable from day one?
- Should page creation record an initial baseline immediately or only after first edit?
- Should restore of a moved/deleted object default to original path, current path, or "restore as copy"?
- Should revision metadata later live in SQLite with JSONL as the durable append-only log, or is JSONL enough for the first implementation?

# Open Questions

These questions do not block the first runtime slice.

## Workspace Internals

- Should `.rumi/` live inside the workspace or app data for local mode?
- Should `.rumi/` be ignored by Git and external sync by default?
- Should snapshots arrive before or after the first web UI?

Current bias:

- Keep `.rumi/` inside workspace for transparency and portability.
- Hide `.rumi/` from user-facing tree.
- Treat `.rumi/` contents as rebuildable or operational unless explicitly documented.
- Use `.rumi/trash/` for portable safe deletion and preserve it as recoverable workspace state.

## References

- Should the official editor write Wikilinks or normal Markdown links in body content by default?
- Should future typed relations require a target database?
- How aggressive should auto-repair be for external moves?

Current bias:

- Follow proposed Decision 019: ordinary links first, then typed database relations that reuse the
  same human-readable link values.
- Store YAML links as quoted Wikilink strings/lists, not `{ path, label }` objects or opaque IDs.
- Keep future relations one-way on disk; derive backlinks/reverse views from the index.
- Auto-repair Rumi-controlled moves.
- Best-effort or prompt for external moves.

## Views

- Should smart/query views be `.view.md` files?
- Should they live in `.rumi/`?
- Should they be code blocks inside a page?

Current bias:

- Defer smart views until folder-backed databases are solid.

## Hosted Rumi

- Should hosted workspaces keep files on disk/volumes?
- Should hosted workspaces use object storage?
- Should hosted workspaces use database-backed documents?

Current bias:

- Do not let hosted design change the first local file-native runtime.

## Collaboration

- How far can versioned full-document save go before true multiplayer is needed?
- Should Rumi use ProseMirror collab, Yjs, or another CRDT later?
- Should block IDs live only in internal indexes or ever be written to files?

Current bias:

- Start with versioned saves and conflict UI.
- Avoid block IDs in every Markdown file.
- Add true multiplayer only after the single-user multi-device loop is safe.

## Offline Access To A Remote Workspace

Tracked in [Remote Workspace Offline Mode](Tasks/xxx-remote-workspace-offline-mode.md).

- Which pages or workspace areas should a browser make available offline: recent pages, explicit
  pins, or the complete workspace?
- Which operations belong in the first writable-offline slice: page edits only, or also
  create/rename/move/delete, database schema changes, and asset uploads?
- How should an authenticated remote workspace authorize access to cached content while the server
  cannot be reached?

Current bias:

- Keep canonical files and conflict resolution on the server. Browser storage is an opt-in cache
  and durable outbox, never a second canonical workspace or a copy of the server index.
- Precache the versioned web application shell with a same-origin service worker and offer an
  installable PWA launcher. A later navigation to the remote workspace URL can then start the
  cached Rumi client even when the server or network is unavailable; API responses remain outside
  the service-worker cache and workspace state loads explicitly from IndexedDB.
- Treat offline authorization as an explicit device capability established by a successful online
  login. A failed session check may enter locally authorized offline mode only when that capability
  and a valid cached workspace exist. Logging out clears both. Decide separately whether the first
  slice trusts the browser profile or encrypts the cache behind a local unlock secret.
- Store cached page state as content-addressed full snapshots using a deterministic client encoding,
  while retaining the server version separately as an opaque concurrency token. An unchanged page
  refers to one blob; a dirty page retains its base and local snapshots until synchronization.
  Prefer this bounded duplication over a durable patch chain, which is harder to recover and
  validate. Compress and garbage-collect unreferenced clean blobs if storage pressure requires it.
- Queue versioned, idempotent domain commands. On reconnect, apply commands through the runtime API;
  do not replay raw filesystem writes or client-side index changes.
- Reconcile an offline page edit using a three-way merge of cached base, local draft, and current
  server content. Auto-merge independent body/frontmatter changes, but never silently overwrite an
  overlapping edit, edit-versus-delete, or ambiguous identity change.
- Expose stable server-internal workspace/object identity to the client without writing IDs into
  Markdown. Path-only identity is insufficient for offline rename, move, and delete conflicts.
- Start with cached-page reading and editing. Defer offline structural commands, database-schema
  changes, and assets until the page-edit loop, conflict recovery, authentication, quota handling,
  and multi-tab ownership are proven.

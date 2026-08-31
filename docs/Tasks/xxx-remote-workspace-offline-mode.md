---
status: idea
type: research
milestone: later
owner_layer: web
coverage:
  - runtime
  - markdown
  - api
  - ui-smoke
  - docs
created: "2026-08-20"
updated: "2026-08-20"
---
# Remote Workspace Offline Mode

## Goal

Let a previously authorized browser reopen and use selected content from a remote Rumi workspace
while the server or network is unavailable, preserve edits durably across tab and browser closure,
and reconcile them without silent data loss when the server becomes reachable again.

The feature must preserve Rumi's existing ownership boundary:

```text
remote Markdown files = canonical user content
server runtime = canonical command and conflict authority
browser storage = opt-in cache, local draft store, and durable outbox
```

This task is intentionally `idea`/research. Resolve the product, security, storage, identity, merge,
and protocol questions below before splitting implementation work into milestone tasks.

## Product Outcome

After one successful online setup, a user should be able to:

1. Install Rumi as a PWA or reopen the same remote workspace URL from a bookmark.
2. Start the cached Rumi application even when DNS, the network, or the Rumi server is unavailable.
3. Pass the selected local offline-authorization policy.
4. Browse the cached workspace tree and pages that are available on this device.
5. Edit an already cached page and see when the draft is saved locally versus synchronized.
6. Close the tab or browser without discarding a locally committed draft.
7. Reopen offline and continue editing that draft.
8. Reconnect and either synchronize automatically or resolve an explicit, recoverable conflict.

Offline mode cannot work on a device that has never successfully loaded and prepared the Rumi
application and workspace. Clearing browser site data also removes the application shell, local
authorization, cached content, and pending drafts.

## Current System Findings

### Existing Foundations To Reuse

- Markdown/YAML files remain canonical; the server-owned SQLite index is rebuildable and must not be
  mirrored as a second client source of truth.
- `PageDocument` already returns a content-derived `version`, `contentHash`, and `frontmatterHash`.
- `savePage` already accepts `baseVersion` and returns a structured conflict for a stale existing
  file.
- Database schema/view mutations already use schema versions and semantic runtime commands.
- Runtime commands own file writes, indexes, references, revisions, Trash, and normalized events.
- Rumi revision history already has server-internal `objectId` continuity and content-addressed
  Markdown blobs. Those IDs are not currently exposed in the workspace/page contracts.
- The web client already has a bounded startup snapshot with workspace, tree, selection, settings,
  and one page. This is a startup optimization in `localStorage`, not a general offline store.
- The built server already gives fingerprinted static assets long immutable cache lifetimes and
  serves `index.html` with revalidation.

### Gaps And Unsafe Behaviors

- No service worker, web application manifest, install flow, or offline navigation fallback exists.
- The production and preview CSP currently set `worker-src 'none'`, which blocks a same-origin
  service worker. Offline support requires a narrowly scoped `worker-src 'self'` policy.
- The server's blanket immutable static-file policy must not apply to the service-worker entrypoint.
  The browser must revalidate `sw.js` (or its equivalent) so a release is not pinned for 30 days.
- `AuthGate` treats an unreachable `/api/auth/session` as a terminal connection error. It has no
  locally authorized offline state.
- The current startup snapshot is limited to 1.5 MB, is keyed by server `rootPath`, contains only one
  page, and deliberately does not authorize offline access.
- `OpenWorkspaceResult` has no stable public `workspaceId`; `rootPath` is host-specific and is not a
  safe long-term remote cache identity.
- The server hashes the exact serialized Markdown file, while `PageDocument` returns parsed
  frontmatter plus a Markdown body. Re-serializing those fields is not guaranteed to reproduce the
  exact bytes behind the server hash. Keep the server `version` as a concurrency token and define a
  separate deterministic client snapshot encoding/hash unless the API later returns canonical
  serialized bytes.
- `WorkspaceNode` and `PageDocument` expose path identity only. Path identity is insufficient for
  rename, move, delete, and restore reconciliation across a disconnected period.
- The current client rebase keeps the entire locally dirty body or frontmatter object. Concurrent
  remote changes in the same dirty part can therefore be overwritten after a retry. Offline mode
  requires a real three-way merge and explicit conflict state first.
- `savePage` only reports a stale-version conflict when the target currently exists. If an edit with
  a `baseVersion` arrives after remote deletion, the current implementation recreates the missing
  file. Edit-versus-delete must become a conflict, not silent resurrection.
- Create/rename/move/delete and asset endpoints do not have durable mutation IDs. Retrying an
  uncertain create can produce a second collision-suffixed object.
- SSE event IDs are live invalidation hints, not a durable replay log. A disconnected client cannot
  reconstruct server truth by replaying missed events.
- The current UI has `idle`, `dirty`, `saving`, `saved`, and `error` save states but does not
  distinguish locally durable content from server-synchronized content.

## Architecture Bias

Do not create a duplicate local workspace folder and do not make browser storage canonical.

Use three client-side facilities with separate responsibilities:

```text
CacheStorage
  versioned Rumi application shell only

IndexedDB
  workspace manifest/tree metadata
  content-addressed page and optional asset blobs
  base/local document references
  offline device capability
  durable semantic-command outbox
  conflicts and schema/migration state

Service worker
  cached navigation/application startup
  static-asset precaching and version transition
  no generic caching of /api responses
```

The headless client layer owns persistence, connection state, synchronization, and conflicts. React
components consume that state and present it. The service worker must not become a parallel
workspace runtime.

Do not use a CRDT for the first offline slice. Versioned full-document saves plus a three-way merge
fit the current single-user, multi-device goal with fewer durable protocols and no required block
IDs in Markdown.

## Offline Boot And Reopen Flow

### First Successful Online Preparation

1. Load and authenticate the normal remote Rumi application over HTTPS.
2. Register a same-origin service worker at a scope that covers every Rumi application route.
3. Atomically precache `index.html`, the current fingerprinted JS/CSS chunks, icons, and the web app
   manifest. Keep enough previous shell state to avoid stranding an open or offline client during an
   interrupted upgrade.
4. Establish a stable `(origin, workspaceId)` cache namespace.
5. Let the user explicitly enable offline access for this device.
6. Store the chosen offline authorization capability and initial cached workspace data.
7. Request persistent browser storage as a best effort and show whether the browser granted it.
8. Report “Available offline” only after the shell, authorization state, workspace manifest, and
   selected content have all committed successfully.

### Later Offline Navigation

1. The user opens the installed PWA or the same HTTPS URL/bookmark.
2. The browser starts the registered service worker for that origin and scope.
3. The service worker returns the cached application shell for a navigation request, including a
   deep workspace/page route.
4. The application attempts a real auth/session request.
5. Network failure, timeout, and server unavailability may enter offline mode only when a valid
   local device capability and matching cached workspace exist.
6. `401`/`403` from a reachable server are authorization results, not generic offline signals.
7. The application loads workspace state from IndexedDB and clearly labels it offline/stale.
8. Local edits commit to IndexedDB and the outbox. No UI may claim “Synced” until the server
   acknowledges them.

The manifest/install experience is recommended for discoverability and launcher behavior, but a
bookmark to the same controlled URL must also work. A different hostname, port, protocol, browser
profile, or cleared site store is a different origin/storage boundary and cannot reuse the cache.

## Service Worker Policy

- Prefer a generated precache manifest from the production Vite build over hand-maintained asset
  lists. Evaluate a small native service worker against a focused Vite/Workbox integration before
  choosing the dependency.
- Cache the application shell and fingerprinted static assets. Do not indiscriminately cache
  `/api/*`, authenticated JSON responses, mutations, SSE, or login/logout responses.
- Serve a cached application shell for same-origin navigation requests when the network is
  unavailable. API behavior remains explicit in the headless client.
- Treat `navigator.onLine`, service-worker lifecycle callbacks, browser `online` events, and SSE
  errors as hints. A real API response determines connection/auth state.
- Do not rely on Background Sync for correctness or eventual delivery. Browser support and
  scheduling are not reliable enough. It may be an optional optimization; mandatory synchronization
  occurs whenever an authorized client is open and connectivity returns.
- Version shell caches and delete obsolete unreferenced caches only after a new shell activates
  successfully. Keep application-shell and IndexedDB schema compatibility explicit.
- Serve the service-worker entrypoint with `Cache-Control: no-cache` or equivalent revalidation.
- Keep all worker code same-origin and retain the rest of the current restrictive CSP.

## Proposed Browser Storage Model

The exact IndexedDB library and schema remain an implementation decision. The logical records
should resemble:

```text
workspace {
  origin,
  workspaceId,
  serverEpoch?,
  displayName,
  cachedAt,
  treeVersion?,
  tree,
  settingsSubset,
  cachePolicy
}

object {
  workspaceId,
  objectId,
  path,
  kind,
  baseVersion,
  baseBlobHash,
  localBlobHash,
  syncState,
  cachedAt
}

blob {
  blobHash,
  contentType,
  bytes
}

outboxCommand {
  operationId,
  workspaceId,
  objectId?,
  localObjectId?,
  type,
  payload,
  baseVersionOrPrecondition,
  dependsOn[],
  sequence,
  state,
  createdAt,
  lastAttemptAt?,
  error?
}

conflict {
  conflictId,
  operationId,
  objectId,
  kind,
  baseBlobHash?,
  localBlobHash?,
  remoteBlobHash?,
  remoteVersion?,
  createdAt
}

offlineCapability {
  workspaceId,
  issuedAt,
  lastOnlineValidationAt,
  policyVersion,
  encryptedKeyMaterialOrTrustedProfileMarker
}
```

Store page state as content-addressed full snapshots using a deterministic client encoding. Keep
the returned server `version` beside the acknowledged base as an opaque concurrency token; do not
assume a client reserialization hashes to the same value as the original server file. Research may
instead extend the page-open contract with canonical serialized Markdown bytes if that makes
integrity, merge, and recovery materially simpler without weakening the structured editor boundary.

An unchanged object points its base and local references at one blob. A dirty object keeps at most
the base needed for three-way merge plus its latest committed local snapshot. This bounded
duplication is preferable to a durable patch chain:

- recovery does not require replaying every patch;
- integrity can be checked directly by hash;
- a local snapshot remains readable after a partial migration or command failure;
- old drafts can be garbage-collected by reachability;
- Markdown is normally small and can be compressed if measurement justifies it.

Do not duplicate the server SQLite/search index. Offline search may later search only cached
documents with an explicit label, but it must not pretend to represent the complete workspace.

## Local Draft Durability

- The editor keeps ProseMirror as live state and serializes Markdown at a deliberate local-save
  boundary, not on every transaction solely for persistence.
- A local autosave must commit the new blob reference and corresponding outbox state atomically.
- Show `Saving locally…`, `Saved on this device`, `Syncing…`, `Synced`, and `Needs attention` as
  distinct states.
- A tab close, process crash, or power loss can only guarantee edits through the last completed
  IndexedDB transaction. Set and test a clear local-autosave latency target.
- Use `visibilitychange`/page lifecycle signals only as an extra flush opportunity; do not depend on
  an asynchronous `beforeunload` write for correctness.
- Never evict a dirty local snapshot, its merge base, its outbox command, or a conflict record.

## Connection And Synchronization State

Model connection state explicitly instead of inferring it from one boolean:

```text
starting
online
offline-authorized
offline-unavailable
reconnecting
syncing
conflicted
authentication-required
upgrade-required
```

Reconnect attempts should use bounded timeouts and backoff, retry on useful lifecycle hints, and
avoid request storms across tabs. On successful reconnection:

1. Revalidate authentication and server/workspace identity.
2. Refetch the canonical tree or a future authoritative sync summary.
3. Resolve current object paths by `objectId`, not only cached path.
4. Reconcile dirty page objects against current server documents.
5. Submit ready outbox commands in dependency/sequence order.
6. Stop an object's dependent commands when it conflicts; independent objects may continue.
7. Apply returned canonical paths, versions, hashes, indexes-as-events, and identity mappings.
8. Advance each acknowledged local base and garbage-collect unreachable clean blobs.
9. Reconnect SSE only for future invalidation; do not treat its missing history as recovered truth.

For the initial page-edit-only slice, a full tree refetch plus current reads of dirty pages is the
simplest authoritative pull. Add a durable server change cursor/tombstone feed only after workspace
size measurements show that full revalidation is materially expensive.

## Page Edit Merge Contract

For each dirty page, use:

```text
B = exact cached server base from the last acknowledged version
L = latest locally committed offline document
R = current server document after reconnection
```

Rules:

1. If `R.version === baseVersion`, save `L` with that base version.
2. If `L` is unchanged from `B`, accept `R` and clear the redundant local command.
3. If `R` is unchanged from `B`, save `L`.
4. Otherwise merge body and frontmatter separately.
5. Use a deterministic diff3-style Markdown body merge. Independent changes may merge
   automatically; overlapping changes create a conflict.
6. Merge frontmatter per property, including adds, edits, and removals. If only one side changed a
   property, keep that change. Equal final values are not a conflict. Different changes from the
   same base are a conflict.
7. Database-schema-owned properties and unsupported future YAML must preserve their existing
   runtime/format contracts. Do not flatten schema operations into a raw text merge.
8. Save an automatically merged result against `R.version`. A second conflict repeats only within a
   small bounded retry loop, then requires attention.
9. Preserve `B`, `L`, and `R` until the merged write is acknowledged or the user explicitly resolves
   the conflict.
10. Never silently choose the complete dirty local body over changed remote content.

The conflict UI must offer at least local, remote, and merged/manual views; accepting either side
creates a new version through the normal runtime save boundary. The server revision layer should
capture the canonical pre-resolution content according to its existing checkpoint policy.

## Identity And Precondition Contract

Offline structural correctness requires identities that remain stable while paths change:

```text
workspaceId = stable remote workspace identity
objectId = stable server-internal logical object identity
path = current human-readable location
contentHash/version = exact content state
operationId = idempotency identity for one client mutation
```

- Add `workspaceId` to the open-workspace contract and partition local data by origin plus that ID.
- Expose opaque `objectId` on relevant tree/page records without writing IDs into Markdown or
  filenames.
- Define what happens if `.rumi/` identity state is lost and regenerated. A workspace/server epoch
  may be needed so a client cannot apply old commands to unrelated replacement objects.
- Later offline creates use a client-local object ID until the server returns the canonical
  `objectId` and actual collision-safe path.
- Mutation requests that can be replayed must accept `operationId`; the server persists enough
  acknowledgement history to return the original result for duplicates.
- Strengthen save preconditions so an edit that expected an existing object conflicts if that
  object is now missing. Keep create intent separate from edit intent.
- Define expected object path/version preconditions for rename, move, delete, restore, presentation,
  schema, and asset operations before enabling them offline.

## Conflict And Edge-Case Policy

The following cases must be decided and tested before their operation is enabled offline:

| Local action | Remote action | Initial policy bias |
| --- | --- | --- |
| Edit page | Edit independent lines/properties | Three-way auto-merge, then versioned save |
| Edit page | Edit overlapping content | Preserve all three snapshots and require resolution |
| Edit page | Rename/move same object | Follow `objectId` to the new path, merge content there |
| Edit page | Delete same object | Conflict; offer discard or restore/recover, never silently recreate |
| Edit page | Convert containing folder/database | Conflict or defer until canonical kind/context reloads |
| Rename/move | Remote content edit | Later slice: apply structural command by identity, then merge edit |
| Rename/move | Different remote rename/move | Later slice: explicit structural conflict |
| Delete | Remote edit | Later slice: require confirmation with remote content preserved |
| Create | Same requested name exists | Idempotent retry returns the original create; unrelated collision uses runtime suffixing |
| Edit database record | Schema changed | Reload schema; merge record fields only when property semantics remain compatible |
| Schema command | Concurrent schema command | Semantic version conflict; no raw `.db.md` merge |
| Upload asset | Retry after unknown response | Content/operation identity prevents duplicate uploads |
| Edit referencing asset | Asset not cached/uploaded | Dependency remains pending and page must not publish a broken canonical reference |
| Presentation edit | Remote presentation edit | Reconcile against its separate presentation version |
| Server workspace replaced | Pending local edits | Stop sync; export/recovery path, never apply by matching paths alone |

Also cover:

- server restart between request commit and client acknowledgement;
- session expiration or password reset while offline;
- remote reference repair changing a cached page;
- external filesystem rename with probable/ambiguous identity;
- Trash restore choosing a collision-safe new path;
- browser clock changes; ordering must use local monotonic sequence, not timestamps alone;
- duplicate tabs editing the same cached page;
- quota exhaustion during a local save;
- abrupt tab/process termination during an IndexedDB transaction;
- an application update that changes Markdown serialization or IndexedDB schema;
- partial or corrupted cached blobs detected by content hash;
- opening an explicit deep link that is not available in the offline cache;
- browser eviction or user-cleared site data;
- a renamed remote hostname/origin that cannot access the old origin's browser storage.

## Offline Authentication And Local Security

Offline access is possession of a local copy and therefore cannot have exactly the same revocation
semantics as online server authentication.

Before implementation, choose and document one first-slice policy:

### Option A: Trusted Browser Profile

- A successful online login plus explicit “Enable offline access on this device” stores a local
  capability marker.
- Anyone who can open that browser profile can read the offline workspace.
- This is simple and matches many offline web applications, but the UI must state the trust model.

### Option B: Locally Encrypted Cache

- Enabling offline access creates an encrypted workspace cache protected by a separate local unlock
  secret or platform-backed key.
- Decide key derivation, recovery, failed-attempt behavior, and whether the normal server password
  may be reused without storing a reusable server credential.
- Encryption reduces exposure from casual disk/profile access but does not make a running
  same-origin application immune to XSS. Keep CSP and application integrity as primary controls.

For either option:

- Only a successful online session may provision or refresh offline capability.
- A network failure may use local capability; an explicit online `401`/`403` must leave online mode
  and follow the chosen lock/purge policy.
- Logging out intentionally clears the capability, workspace data, conflicts, and pending commands
  after warning about unsynchronized edits. The public application shell may remain cached.
- Server-side logout, password reset, session expiry, or administrator revocation cannot erase a
  device that is still offline. Apply the decision on next contact and document this limitation.
- Never store the server password or raw session token in readable browser application storage.
- Offline mode must be opt-in for remote authenticated workspaces and identify the device-local
  storage risk clearly.

## Cache Selection, Assets, Quota, And Eviction

Decide whether the first product supports recent pages, explicit pins, or a complete workspace.
Current bias is recent pages plus explicit “Available offline” pins, with a bounded total cache.

- Clean unpinned content may be evicted using an inspectable policy.
- Dirty snapshots, their bases, pending commands, and conflicts are non-evictable.
- Content-addressed blobs are garbage-collected only when no object, command, or conflict references
  them.
- Handle `QuotaExceededError` as a local-save failure with recovery/export actions, not as a silent
  loss.
- Use `navigator.storage.persist()` as a best effort. The UI must not claim persistence guarantees
  the browser does not provide.
- Measure real Markdown workspace sizes before adding patch storage or compression. Add compression
  only if it materially improves the quota envelope without obscuring recovery.
- Define whether pinning a page includes already-existing referenced images/files. A text-only first
  slice must show intentional offline placeholders rather than broken requests.
- Offline asset upload is a later semantic command with blob size/type policy, dependencies, and
  idempotency. Do not let large pending assets starve Markdown draft durability.
- Revisions, Trash payloads, complete database query results, search indexes, and arbitrary assets
  are not implicitly cached with the tree.

## Multi-Tab And Background Ownership

- Use IndexedDB transactions as the durable authority and BroadcastChannel or equivalent to notify
  same-origin tabs of local changes.
- Elect one active synchronization leader with Web Locks or a small lease protocol so multiple tabs
  do not submit the same outbox concurrently.
- Server idempotency remains required even with a leader because crashes can occur after server
  commit and before local acknowledgement.
- Define the behavior when two offline tabs edit the same page. At minimum preserve both local
  branches and surface a local conflict; last-writer-wins is not acceptable without an explicit
  product decision.
- Closing every tab leaves the outbox durable. Synchronization resumes on next open. Optional
  background sync must not be the only delivery path.

## App And Data Upgrade Safety

- Version the service-worker shell cache, IndexedDB schema, stored record formats, hash algorithm,
  merge algorithm, and command contract deliberately.
- Prefer additive/backward-compatible stored records. Run migrations transactionally and retain an
  export/recovery path for pending drafts when migration cannot complete.
- Do not activate a shell that cannot read the existing outbox. Consider delaying destructive
  cleanup of the prior shell until the new client proves it can open the local store.
- If the server requires a newer client/command protocol, stop synchronization with an explicit
  upgrade state; never reinterpret an old pending command silently.
- Test online deployment while one tab is open, offline restart on an old shell, reconnect upgrade,
  and migration with pending/conflicted edits.

## Proposed Contract Changes To Investigate

Do not add these mechanically. Confirm the smallest set during research:

- `OpenWorkspaceResult.workspaceId` and possibly `serverEpoch`/identity generation.
- `WorkspaceNode.objectId` and `PageDocument.objectId`.
- Required expected-existence/version semantics for page edits.
- An idempotent mutation envelope such as `{ operationId, ...command }`.
- Duplicate-operation response/readback behavior and server retention limits.
- A lightweight authoritative reconnect summary only if tree-plus-dirty-page revalidation is not
  sufficient.
- Explicit auth/session signals that distinguish reachable unauthenticated, unreachable, and
  offline-capability states without teaching the runtime about HTTP authentication.
- Client-owned local sync/conflict types that do not leak IndexedDB or service-worker details into
  runtime contracts.

Any accepted cross-layer behavior must update the relevant decision and contracts in the same
implementation pull request.

## Headless Client Responsibilities

Move reusable behavior out of `App.tsx` before adding offline branches throughout React:

- connection and authentication state;
- workspace cache read/write and migrations;
- content-addressed blob ownership;
- local page save coordinator;
- outbox sequencing and idempotent retry;
- page three-way merge and conflict records;
- canonical event invalidation and reconnect revalidation;
- multi-tab leader/notifications;
- cache pinning, quota, and garbage collection;
- observable sync state for the official UI and future clients.

The official UI owns the offline banner, availability controls, local/synced status, conflict
resolver, quota messaging, local unlock, and recovery/export interactions.

## Suggested Delivery Slices

### Slice 0: Research And Contracts

- Choose offline auth policy, cache scope, service-worker build strategy, workspace/object identity,
  mutation idempotency, deleted-target preconditions, and merge behavior.
- Prototype the production shell offline and measure representative workspace/cache sizes.
- Write accepted decisions, cross-layer contracts, and implementation tasks.

### Slice 1: Reopenable Read-Only PWA

- Manifest, icons, same-origin service worker, CSP/header changes, production precache, and deep-route
  navigation fallback.
- IndexedDB workspace/cache foundation with schema versioning.
- Explicit offline setup/availability state and selected cached pages.
- Offline AuthGate path under the chosen device policy.
- No local mutations yet.

### Slice 2: Durable Offline Editing Of Existing Pages

- Local draft transaction and outbox.
- Local-versus-synced save states.
- Stable workspace/object identity and strict edit preconditions.
- Three-way Markdown/frontmatter merge and conflict UI.
- Reconnect revalidation, idempotent page-save acknowledgement, and restart recovery.
- No offline structural/schema/asset mutation.

### Slice 3: Reliability And Storage Hardening

- Multi-tab leadership/local conflicts.
- Quota UI, pinning, garbage collection, persistent-storage status, corruption recovery, and export.
- Shell/data migrations with pending commands.
- Failure-injection and real-browser offline/restart QA.

### Later Slices

- Offline create/rename/move/delete/restore.
- Database semantic commands and cached database views.
- Existing asset pinning and offline asset uploads.
- Presentation mutations.
- Cached-document search.
- Durable server change cursors only if measured scale requires them.

## First Writable Slice: Explicitly Out Of Scope

- True multiplayer, presence, cursors, or CRDT storage.
- Browser access to a real local workspace directory.
- A second local Rumi runtime or local SQLite mirror.
- Full workspace sync by default.
- Git/GitHub as the synchronization protocol.
- Offline structural commands, database-schema changes, asset uploads, revision restore, and Trash
  mutation.
- Guaranteed delivery while every Rumi tab/PWA window is closed.
- First-time offline access on a device that was never prepared online.
- Immediate remote revocation or deletion of data from a device that remains offline.

## Decisions Required Before Moving To `ready`

- [ ] Choose recent, pinned, or complete-workspace cache scope and size defaults.
- [ ] Choose trusted-profile or locally encrypted offline authorization for the first slice.
- [ ] Define logout, online `401`, password reset, revocation, and pending-edit recovery behavior.
- [ ] Choose native service worker or focused build integration and prove production deep-route boot.
- [ ] Define service-worker update headers and shell/data compatibility policy.
- [ ] Define stable `workspaceId`, `objectId`, and optional server/workspace epoch lifecycle.
- [ ] Define required save expected-existence/version semantics, including remote deletion.
- [ ] Define operation idempotency storage, duplicate result behavior, and retention.
- [ ] Specify deterministic body and frontmatter three-way merge rules.
- [ ] Design the minimum conflict resolution and local draft export/recovery UI.
- [ ] Set local-autosave durability latency and clarify the crash-loss window.
- [ ] Decide how cached pages handle referenced existing assets.
- [ ] Define quota budgets, pinning, eviction, and non-evictable records.
- [ ] Define multi-tab edit and synchronization ownership.
- [ ] Measure whether full tree plus dirty-page revalidation is adequate at representative scale.
- [ ] Split accepted work into small vertical implementation tasks with owning-layer contracts.

## Required Coverage

Research must produce the exact final matrix. Expected minimum implementation coverage:

- [ ] Runtime tests prove strict edit preconditions, deleted-target conflict, stable identity across
  Rumi moves/restores, idempotent duplicate operations, and no file/index/event side effects for
  conflicts.
- [ ] Markdown tests prove deterministic three-way merges across paragraphs, headings, lists, task
  items, tables, code/Mermaid blocks, links, embeds, frontmatter adds/edits/removals, unsupported
  YAML, blank lines, and conflict markers/records without corrupting canonical Markdown.
- [ ] API tests prove identity fields, expected-version/missing-target conflicts, operation
  idempotency, authentication outcomes, restart-after-commit retry, and normalized error shapes.
- [ ] Headless-client tests prove IndexedDB migrations, atomic local commits, outbox ordering,
  reconnect state, bounded retries, base advancement, garbage collection reachability, quota
  failure, corruption detection, and recovery after tab/process restart.
- [ ] Multi-tab tests prove one sync leader, duplicate-delivery safety, cross-tab cache updates, and
  preservation of concurrent local branches.
- [ ] Service-worker/build tests prove the production bundle contains a manifest and complete shell
  precache, deep routes fall back offline, `/api` is not generically cached, worker CSP is narrow,
  and the worker entrypoint is revalidated rather than immutable.
- [ ] UI smoke tests prove explicit enable/disable, first-load limitation, offline reopen, cached and
  uncached page states, local-versus-synced status, edit persistence across reload, reconnect sync,
  conflict resolution, auth expiry, quota failure, and logout warning/purge.
- [ ] Migration tests prove a new application shell can open older clean, dirty, and conflicted
  stores without dropping pending content.
- [ ] Documentation covers preparation, installation/bookmark reopening, supported offline scope,
  browser storage/eviction limits, local security, logout/revocation limitations, sync states,
  conflict recovery, export, and troubleshooting.

## Manual And Failure-Injection QA

- Prepare a real password-protected remote instance through HTTPS in a disposable browser profile.
- Enable offline access, install/open the PWA, cache multiple pages, stop the server and disable the
  network, close every tab/window, and reopen into the cached workspace.
- Repeat with a deep page URL and an uncached page URL.
- Edit offline, wait for confirmed local durability, close the browser, reopen offline, and verify
  exact Markdown/frontmatter recovery.
- Test remote independent edit, overlapping edit, rename, move, and delete before reconnect.
- Kill the client after the server commits but before the local acknowledgement and verify an
  idempotent retry.
- Exhaust or simulate storage quota during local save and verify the previous durable draft remains.
- Run two tabs through online/offline transitions and concurrent edits.
- Deploy a new web build while a client has clean, dirty, and conflicted local records.
- Expire/reset the server session while the client remains offline, then reconnect.
- Clear site data and verify the product accurately reports that offline content is gone.
- Verify that logout with pending edits cannot discard them without explicit confirmation/recovery.

## Research Done When

- The required decisions above are resolved with evidence from a production-shell prototype,
  representative storage measurements, and failure-case walkthroughs.
- Accepted architecture is captured in decision records rather than only this task.
- Runtime/API, editor-save, server-event, auth, and testing contracts are updated or have explicit
  follow-up tasks.
- The work is split into reviewable vertical tasks beginning with a reopenable read-only PWA and
  then durable editing of existing cached pages.
- No implementation task depends on silent last-writer-wins, path-only identity, best-effort
  browser background sync, or an unbounded patch chain.

## Related Work

- `docs/open-questions.md` — Offline Access To A Remote Workspace.
- `docs/Decisions/002-files-are-canonical.md`.
- `docs/Decisions/003-path-and-fingerprint-identity.md`.
- `docs/Decisions/006-runtime-commands-over-low-level-api.md`.
- `docs/Decisions/007-editor-live-state-save-boundary.md`.
- `docs/Decisions/015-runtime-event-bus-transport-adapters.md`.
- `docs/Decisions/017-rumi-owned-revision-history.md`.
- `docs/Contracts/editor-save-contract.md`.
- `docs/Contracts/runtime-commands.md`.
- `docs/Contracts/server-events.md`.
- `docs/Tasks/M07-015-workspace-startup-and-session-navigation.md`.
- `docs/Tasks/xxx-multiplayer-crdt.md`.

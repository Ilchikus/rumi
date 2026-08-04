---
status: idea
type: feature
milestone: later
owner_layer: runtime
coverage:
  - runtime
  - api
  - cli
  - ui-smoke
  - docs
created: "2026-07-27"
updated: "2026-07-27"
---
# Opt-In QMD Semantic Search PRD

## Status

Deferred for later. This document captures the agreed product direction and the work needed to
promote it into scoped implementation tasks. It does not add qmd to the current release or change
the existing search contract.

## Summary

Add `tobi/qmd` as an optional, server-owned semantic-search capability. Rumi's current search
continues to provide immediate deterministic matches. When enabled, qmd contributes an additional
“related by meaning” result set for natural-language queries.

Users choose one of two tiers:

| Tier | Search capability | Approximate model download |
| --- | --- | ---: |
| Easy | Embedding-based vector retrieval | 300 MB |
| Deep | Easy plus query expansion, hybrid retrieval, and reranking | 2 GB total |

The sizes are estimates that must be resolved from the pinned model artifacts before confirmation.
Deep is approximately 1.7 GB beyond Easy rather than a separate 2 GB embedding model.

## Problem

The existing index is intentionally strong at exact title, prefix, path, property, and literal body
matches. It cannot reliably connect a question to notes that use different language.

Example:

```text
Query:
what presents for family did I note in my journal?

Potential note:
Journal/2025-11-08.md
## Christmas gift ideas
Mom — pottery class
Dad — noise-cancelling headphones
```

Semantic retrieval should surface that note even though “presents” does not occur in it. The result
should show the Rumi page title, path, and the relevant passage. Producing a synthesized answer such
as “Mom: pottery class; Dad: headphones” is not part of this task.

## Confirmed Product Decisions

- The capability is disabled by default.
- It adds to existing search rather than replacing it.
- Easy and Deep are separate explicit choices.
- Easy uses the smaller embedding/vector path.
- Deep installs the remaining qmd models and enables query expansion and reranking.
- Rumi manages setup, progress, health, disablement, and removal. A user should not need to install
  or operate qmd manually.
- Downloads and inference occur on the server host. A remote browser does not download or execute
  the models.
- No model is downloaded and no semantic index is built until the owner opts in.
- Existing search, editing, saving, and startup continue to work when semantic search is disabled,
  unavailable, updating, or failed.
- Semantic processing remains local to the Rumi host. Workspace content is not sent to qmd, model
  vendors, or a hosted inference API.

## Goals

- Retrieve relevant notes when the query and note use different words.
- Preserve the speed, availability, and ranking guarantees of current search.
- Provide a complete Rumi-owned opt-in flow with honest resource expectations.
- Keep semantic indexes disposable and rebuildable from canonical Markdown.
- Support external file edits, Rumi mutations, moves, deletes, Trash restore, and reconciliation.
- Make Easy useful on ordinary self-hosted hardware without requiring the full Deep download.
- Make Deep available for users who want stronger natural-language retrieval and accept its cost.
- Expose enough status and diagnostics to make failures understandable and recoverable.

## Non-Goals

- Replacing Rumi's current deterministic search or database-record index.
- Sending workspace content to a hosted search or inference service.
- Generating a direct answer from retrieved passages.
- Chat, autonomous agents, or retrieval-augmented generation.
- Automatically enabling the feature after installation or upgrade.
- Downloading models in the browser.
- Requiring users to edit qmd YAML, run qmd CLI commands, or understand qmd collections.
- Guaranteeing GPU availability. CPU operation may be slower but should degrade honestly.
- Choosing a generalized search-plugin ecosystem as part of the first qmd integration.

## User Experience

### Settings

Add a Semantic Search settings surface with:

- `Off`, `Easy`, and `Deep` choices.
- A plain-language explanation of the capability of each tier.
- Exact expected download and available-disk figures resolved before confirmation.
- A statement that processing happens on the server host and content remains local.
- Host compatibility and acceleration status without requiring unsafe native probing at every
  settings-page open.
- Current states: unavailable, not installed, confirming, downloading, installing, indexing,
  ready, updating, disabled with data retained, update required, and error.
- Progress for model download and workspace indexing.
- Retry and cancel actions where the underlying stage is safely cancellable.
- Separate `Disable` and `Remove semantic-search data` actions.

Enabling Deep after Easy downloads only the missing Deep models. Returning from Deep to Easy stops
using the additional models but does not silently delete them.

### Search

- Existing results appear immediately while the user types.
- Semantic inference does not run for every keystroke.
- The user submits a semantic query through Enter or an explicit semantic-search action.
- Semantic results appear asynchronously under a clearly labelled `Related by meaning` section.
- Easy and Deep use the tier selected in settings; the search surface does not silently escalate
  the tier or trigger a new download.
- Each result uses the canonical Rumi title, kind, and workspace-relative path and shows the most
  relevant passage.
- Results remain keyboard navigable and open through the same page-navigation path as current
  results.
- A new query cancels or makes obsolete an older in-flight response so late results cannot replace
  the current query.
- If semantic search is unavailable, normal search remains usable and the semantic section shows a
  concise recoverable state rather than turning the whole search into an error.

### Setup And Removal

- Setup is initiated and observed through Rumi.
- Downloads use a temporary partial file and become active only after validation and an atomic
  final move.
- Interrupted downloads are resumable where the source supports range requests.
- Rumi verifies the expected model artifact, size, and cryptographic checksum before use.
- Removing a workspace semantic index does not remove canonical Markdown.
- Shared host-level models are not deleted while another configured workspace is using them.
- Destructive removal reports what will be removed and requires explicit confirmation.

## Tier Requirements

### Easy Semantic Search

Easy is the first implementation target.

- Use qmd's embedding model and vector index.
- Initial expected model: `embeddinggemma-300M-Q8_0`, approximately 300 MB.
- Index Markdown in semantically meaningful chunks.
- Generate embeddings in tracked background work after opt-in.
- Submit natural-language queries through vector search and return a bounded result set.
- Do not load the query-expansion or reranker models.
- Clearly report when new or changed documents are still awaiting embeddings.

### Deep Semantic Search

Deep builds on a working Easy tier.

- Retain Easy's vector index.
- Add qmd's reranker model, approximately 640 MB.
- Add qmd's query-expansion model, approximately 1.1 GB.
- Use qmd's hybrid flow: lexical and vector candidates, query expansion when appropriate, fusion,
  and reranking.
- Preserve strong exact results rather than allowing semantic reranking to bury an obvious match.
- Bound candidate count, inference duration, memory use, and concurrent searches.
- Allow a request to time out or fall back without affecting normal results.

## Runtime And Index Requirements

- The runtime owns the qmd store and its lifecycle.
- Use one qmd collection rooted at the workspace, with only Rumi-searchable Markdown included.
- Ignore `.rumi`, `.assets`, `.git`, dependency/build directories, hidden application directories,
  Trash payloads, and every path hidden by the Rumi workspace format.
- Store the per-workspace qmd database under `.rumi/`, with the exact path selected in the
  implementation contract.
- Store reusable model files in machine-local Rumi server state outside the workspace.
- Treat qmd data as a rebuildable cache. Opening a workspace must detect missing, incompatible, or
  corrupt semantic data and offer a rebuild.
- Preserve literal Rumi paths, Unicode, case, spaces, and supported special characters.
- Convert qmd results back to canonical Rumi page, folder, and database kinds.
- Derive display titles through Rumi's path rules; qmd's first-heading title extraction must not
  change Rumi object identity or navigation.
- Serialize or otherwise coordinate qmd writes from saves, watcher reconciliation, rebuilds, model
  embedding, direct-runtime CLI processes, and the long-running server.
- The existing fast index remains responsible for current search and database record metadata.
- A canonical Markdown write and existing index update must not wait for expensive embedding work.
- Queue embedding work after mutations, coalesce bursts, and expose eventual-consistency health.
- Rebuild, retry, and shutdown must close native resources cleanly.

## Package And Model Management Requirements

- Pin an exact compatible qmd package version. Never install an unbounded `latest` version from the
  settings action.
- Validate Node version, operating system, CPU architecture, native qmd dependencies, available
  storage, and writable cache locations before starting setup.
- Decide before implementation whether qmd ships as a dormant Rumi dependency or as a separately
  installed Rumi add-on. In either case, users operate it only through Rumi.
- A package/provider failure must be isolated so the base Rumi server still starts.
- Model downloads require explicit consent and show source, destination class, and estimated size.
- Permit an operator-provided local GGUF path or pre-provisioned cache for offline and controlled
  deployments.
- Do not execute package lifecycle scripts or replace an installed provider without a pinned,
  reviewed upgrade path.
- Record the qmd version and model fingerprints used to create an index. Incompatible upgrades
  require a safe rebuild, not silent reuse.
- Review and record the package and model licenses before distribution.

## Proposed Runtime/API Direction

Final names and shapes require contracts before implementation. The expected product operations are:

```text
getSemanticSearchStatus
configureSemanticSearch
cancelSemanticSearchSetup
rebuildSemanticSearchIndex
searchWorkspaceSemantic
removeSemanticSearchData
```

Status needs to report:

- configured tier;
- provider/package availability and version;
- required and installed models;
- download and indexing progress;
- document/chunk coverage and pending embeddings;
- last successful build/update;
- degraded or error reason;
- whether the current host can run Easy and Deep.

Long-running setup and indexing progress should use normalized runtime events and the existing event
transport. HTTP handlers and the web client must not coordinate files, qmd tables, model downloads,
or index writes directly.

Semantic-result contracts should include:

- Rumi workspace-relative path;
- Rumi document kind and display title;
- relevant snippet or best chunk;
- optional source-line information when reliable;
- normalized relevance score;
- semantic tier and retrieval source;
- index freshness sufficient for the client to label partial results.

## Configuration And Storage

- The selected tier is a workspace-owned preference so different workspaces may make different
  privacy/resource choices.
- Machine-local capability and installed-model state must not be mistaken for portable workspace
  configuration. Copying an enabled workspace to a new host produces `setup required`, not an
  automatic download.
- The qmd database and model cache never become canonical workspace content.
- Backups may omit the semantic index and models without losing user data.
- Disabling retains derived data for quick re-enable.
- Explicit removal can independently remove the workspace index and, when safe, unused shared
  models.

## Privacy And Security

- Display explicit consent before the first outbound model download.
- Do not send Markdown content, search queries, embeddings, or snippets to a third party.
- Treat model URLs, versions, and checksums as pinned release metadata.
- Prevent path traversal and symlink escape when selecting an index, cache, or operator-provided
  model.
- Model and index management endpoints require the same authenticated owner boundary as workspace
  settings.
- Avoid logging query text or retrieved private passages at normal log levels.
- Apply resource limits so a semantic request cannot starve ordinary page saves and API traffic.
- Document that remote users consume CPU/GPU, memory, disk, and network on the server host.

## Performance And Reliability Requirements

- Semantic search being enabled must not materially regress current search latency.
- Initial indexing runs in tracked background work and remains resumable/rebuildable after restart.
- Save, move, delete, restore, and external reconciliation update semantic eligibility without
  blocking on model inference.
- Only one setup/rebuild operation for a workspace may own the same qmd index at a time.
- Concurrent searches are bounded according to host capability.
- Search requests have cancellation/obsolescence and a configured timeout.
- Idle models are unloaded or the qmd store is closed according to a documented resource policy.
- Low-memory and CPU-only hosts receive honest warnings and useful failure messages.
- Disk exhaustion, network interruption, corrupt downloads, incompatible native modules, and index
  corruption have recoverable states.

## Rollout Plan

1. **Compatibility spike**
   - Pin a qmd version and validate its SDK, native dependencies, literal paths, Linux-first
     packaging, Node support, database locking, clean shutdown, and license requirements.
   - Benchmark a small Rumi corpus and a larger representative workspace.
2. **Easy provider**
   - Add the isolated runtime adapter, configuration/status model, Rumi-owned model download,
     per-workspace vector index, background embedding, and runtime tests.
3. **Easy API and UI**
   - Add authenticated setup/status/removal commands, progress events, headless client methods, and
     the extended search-results section.
4. **Packaging validation**
   - Prove a clean Rumi install remains usable with the capability disabled and when qmd is
     unavailable.
5. **Deep provider**
   - Add the extra downloads, bounded hybrid pipeline, reranking, evaluation fixtures, and Deep UX.
6. **Operational hardening**
   - Add upgrade/rebuild handling, diagnostics, cancellation/restart recovery, offline model paths,
     and removal/reference tracking.

Promote each stage into a focused task with its own owner and coverage before implementation. Do not
implement this entire PRD as one change.

## Required Coverage

- [ ] Runtime test proves disabled semantic search creates no qmd index, downloads no model, and
  leaves existing search unchanged.
- [ ] Runtime tests cover Easy configuration, index build, vector-result mapping, pending
  embeddings, rebuild, disable, and explicit removal.
- [ ] Runtime tests cover save, move, rename, delete, Trash restore, and external reconciliation.
- [ ] Runtime tests cover interrupted/corrupt download recovery without real multi-hundred-megabyte
  fixtures.
- [ ] Deep tests cover query expansion/reranking orchestration, limits, timeout, and fallback using
  a fake provider.
- [ ] API tests protect setup/status/progress/search/removal shapes, authentication, and errors.
- [ ] CLI tests cover owner-visible status, setup/rebuild diagnostics, JSON output, and safe
  disable/removal behavior if those commands are exposed.
- [ ] UI smoke tests cover explicit consent, progress, Easy/Deep selection, extended results,
  degraded state, disablement, and removal confirmation.
- [ ] Packaging smoke tests prove the base server starts when qmd is absent or fails to load and
  prove the supported packaged provider loads on each supported platform.
- [ ] An opt-in real-qmd integration suite covers a small checked-in corpus without downloading
  models during normal CI.
- [ ] A relevance fixture includes exact, semantic, ambiguous, journal, alias, and false-positive
  queries and records recall/MRR expectations separately for Easy and Deep.
- [ ] Documentation covers server-host resource use, privacy, offline provisioning, diagnostics,
  disablement, removal, and recovery.

## Acceptance Criteria

- A new or upgraded Rumi installation performs no qmd model download, semantic indexing, or native
  model initialization by default.
- An authenticated owner can enable Easy entirely through Rumi after reviewing the resolved
  download and storage impact.
- Easy builds a disposable workspace index and returns useful `Related by meaning` results without
  delaying or replacing current results.
- An owner can upgrade to Deep through Rumi and only the missing models are downloaded.
- Deep improves the pinned relevance fixture without burying strong exact matches.
- Semantic failure never prevents server startup, page editing, saves, existing search, or
  reconciliation.
- The UI accurately reports downloading, indexing, ready, partial, disabled, update-required, and
  error states.
- Disabling stops semantic queries without deleting data.
- Explicit removal safely deletes the selected derived index/models and never deletes Markdown.
- Workspace content and queries stay on the server host.
- The feature works without manual qmd configuration or commands.
- All selected coverage passes against the packaged Rumi artifact.

## Success Measures

- No measurable regression to current type-ahead search when semantic search is disabled.
- Easy and Deep meet their recorded relevance thresholds on the fixture corpus.
- Setup failures are recoverable without editing files or using qmd directly.
- Index freshness and model disk use are visible and accurate.
- Disabling or removing the capability leaves the workspace and existing index fully usable.

## Open Questions Before Promotion

- Should qmd ship as a dormant dependency or a separately installed Rumi add-on?
- Does adopting qmd make Node 22 the minimum for all Rumi installs, or only for this capability?
- What exact qmd release is safe to pin after special-character path and concurrent-writer tests?
- Which model licenses, checksums, mirrors, and offline distribution paths can Rumi support?
- Should semantic enablement be stored per workspace, per server instance, or as an instance default
  with workspace overrides?
- When should submitted semantic search begin: Enter only, an explicit action, or a longer idle
  delay after typing?
- What is the retention/reference policy for host-level models shared by multiple workspaces?
- What host resource thresholds should warn, block Deep, or force lower concurrency?
- Should a later “Answer from notes” PRD use the Deep models or a separate generation provider?

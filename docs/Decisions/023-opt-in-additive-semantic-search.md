---
status: accepted
areas:
  - server
  - web
  - api
  - index
impact: high
created: "2026-07-27"
updated: "2026-07-27"
---
# Semantic Search Is Opt-In And Additive

## Decision

Rumi may add local semantic search through `tobi/qmd`, but it does not replace the existing
deterministic workspace search.

Semantic search is disabled by default and has two explicit opt-in tiers:

- **Easy semantic search** uses the embedding model and vector search to add results related by
  meaning. Its initial model download is approximately 300 MB.
- **Deep semantic search** adds query expansion and result reranking for harder natural-language
  questions. It requires approximately 1.7 GB beyond Easy, or approximately 2 GB total.

Rumi owns the setup experience. An owner enables a tier through Rumi, sees the expected server-host
download and storage cost, follows installation/download/indexing progress, and can disable the
feature or explicitly remove its downloaded data. Normal use must not require separate `qmd`
commands or manual index configuration.

## Product Boundary

- Existing title, path, property, and body search remains available and responsive.
- Semantic results extend normal results in a separately identifiable section.
- Semantic work does not run for every search-field keystroke. The fast existing results remain the
  type-ahead path; semantic work begins from a submitted semantic query.
- A qmd failure, missing model, unsupported host, or incomplete semantic index does not break
  workspace startup, editing, saves, watcher reconciliation, or existing search.
- Semantic indexing and inference run on the Rumi server host, not in the browser.
- Markdown remains canonical. Every qmd database, vector, model, and derived result is rebuildable
  or removable application state.
- qmd retrieves and ranks relevant passages. Synthesizing a direct answer from those passages is a
  separate future product capability.

## Packaging Boundary

Rumi must pin and compatibility-test the qmd integration rather than installing an unbounded
`latest` version. The eventual packaging approach may be a dormant dependency or a separately
installed Rumi add-on, but the user-facing setup and recovery experience remains Rumi-owned.

Large GGUF models are never downloaded merely because Rumi starts or a workspace opens. Model
downloads require explicit owner consent. Model files should be cached outside the canonical
workspace so compatible workspaces on one host can reuse them, while each workspace keeps its own
rebuildable semantic index.

## Why

Natural-language questions such as “what presents for family did I note in my journal?” often do
not share exact words with a note titled “Christmas gift ideas.” Vector retrieval can find that
relationship, while query expansion and reranking can improve difficult or ambiguous result sets.

Keeping the capability additive preserves Rumi's fast, inspectable default and its lightweight
self-hosted path. Separate tiers let a user choose between a smaller useful local model and the
larger full qmd pipeline.

## Consequences

- Semantic-search configuration, capability status, setup progress, index health, and removal need
  runtime/API contracts before implementation.
- qmd's Node, native-module, operating-system, path, concurrency, and model-license requirements
  must pass a packaging spike before the task becomes ready.
- Easy and Deep need honest download, disk, memory, CPU/GPU, and degraded-mode messaging.
- The current search ranking and latency remain regression boundaries.
- Disabling semantic search and deleting semantic data are distinct actions; deletion requires
  explicit confirmation.

## Deferred Work

The product requirements and validation plan live in
[xxx-opt-in-qmd-semantic-search](../Tasks/xxx-opt-in-qmd-semantic-search.md).

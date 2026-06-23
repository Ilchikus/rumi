# Workflow

The new workflow is designed around architecture layers and test coverage.

It replaces the old shape:

```text
task file -> implement feature -> test checklist -> commit
```

with:

```text
decision -> milestone -> contract -> task -> tests -> implementation -> verification
```

## Why

Rumi's hard problems are not just UI tasks.

They cross boundaries:

- Files.
- Markdown serialization.
- SQLite index.
- Watcher reconciliation.
- Web client state.
- CLI behavior.
- API contracts.
- External editors.

The workflow should make those boundaries visible.

## Artifacts

Decisions answer:

```text
What did we choose, and why?
```

Milestones answer:

```text
What slice are we proving?
```

Contracts answer:

```text
What does one layer promise another layer?
```

Tasks answer:

```text
What exact unit of work should be implemented and tested?
```

## Task Lifecycle

Use these statuses:

- `idea`
- `ready`
- `doing`
- `verify`
- `done`
- `blocked`
- `dropped`

Tasks can move from `ready` to `doing` only when the owner layer and required coverage are clear.

Tasks can move to `done` only when required coverage exists and relevant checks pass.

## Owner Layer

Every task should name the layer that owns the behavior:

- `runtime`
- `markdown`
- `api`
- `web`
- `editor`
- `cli`
- `database`
- `watcher`
- `docs`

If ownership is unclear, create or update a contract before coding.

## Runtime-First Rule

For workspace behavior, implement the runtime command first.

Then expose it through:

- HTTP/API.
- CLI if useful.
- Web UI if useful.

Avoid rebuilding Electron IPC as HTTP endpoints. The API should expose intent, not raw filesystem calls.

Bad shape:

```text
web -> writeFile -> dbUpsertRecord -> refreshTree
```

Good shape:

```text
web -> savePage command
server -> write file, update index, emit events
```

## Test Coverage Rule

Every task must include a `Test Coverage` section.

Do not require every test type for every task. Require the tests that match the owner layer and risk.

Example:

```text
renameNode
  runtime test: rename file/folder and companion files
  reference test: links are repaired
  API test: normalized response
  UI smoke test: sidebar open page survives rename
```

Example:

```text
editor bold shortcut
  editor command test
  Markdown roundtrip test if serialization changes
```

## Documentation Rule

Do not leave important new context only in chat.

When a new durable choice is made, add or update a decision record.

When a cross-layer boundary changes, add or update a contract.

When a task uncovers a bigger issue, create a new task or open question rather than hiding it in implementation notes.

Choose the best home:

- Architecture/product choice -> `docs/Decisions/`
- Implementation unit -> `docs/Tasks/`
- Cross-layer boundary -> `docs/Contracts/`
- Milestone/scope change -> `docs/Milestones/`
- Unresolved product/architecture question -> `docs/open-questions.md`
- Lesson from old code or migration work -> `docs/codebase-lessons.md`
- Workflow/testing/source-layout convention -> the matching narrative doc in `docs/`

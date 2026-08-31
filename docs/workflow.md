# Workflow

The workflow is designed around product discovery, architecture layers, test coverage, and verified
delivery.

It replaces the old shape:

```text
task file -> implement feature -> test checklist -> commit
```

with:

```text
product definition / interview
  -> investigation
  -> decision / milestone / contract / task as needed
  -> tests
  -> implementation
  -> QA / verification
  -> code review
  -> push
  -> pull request
  -> merge
  -> versioned npm release when required
  -> post-release verification
  -> documentation follow-up when required
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

## Multiple Tasks Per Release

A release is a delivery boundary, not a task boundary. When one release contains several features
or independently verifiable fixes:

1. Create one task record per independently implementable feature or fix.
2. Keep each task's goal, owner layer, scope, dependencies, required coverage, and done conditions
   independently reviewable.
3. Set the same prospective `release` value on every task committed to that release, using a quoted
   semantic version such as `release: "0.1.17"`.
4. Do not create one oversized release task as a substitute for feature tasks. Add a coordination
   task only when release management itself contains real work not represented by the feature
   records.
5. Treat the tagged task set as the candidate scope. Before release, every included task must meet
   its coverage and QA gates, followed by one integrated release check.
6. If a task slips, move its `release` value to the intended later version and record the scope
   change; do not weaken its done conditions or hold unrelated completed tasks open.

The `release` property is forward-looking. Do not backfill historical tasks merely to make the
database look complete unless a user explicitly requests that migration. Backlog and research tasks
without a committed delivery version may omit it.

## Delivery And Release

QA and code review are separate gates. QA proves the behavior works through the relevant automated
and manual checks. Code review then looks for unnecessary complexity, hidden coupling, unsafe edge
cases, and missing coverage.

Meaningful product changes ship through a pull request. Keep the branch current with `main`, include
required tests and documentation, and merge only when the pull request is clean and review is
complete.

If the change affects the public `@rumi-md/server` distribution:

1. Include the intended package version in the pull request.
2. Run the package release check before merge.
3. Merge the reviewed pull request.
4. Publish npm from the merged commit on `main`, not from a feature branch.
5. Verify the exact public version and the `latest` tag after publishing.

Changes that do not affect the distributable package do not need an npm release. After release,
perform one final documentation check for durable context, release notes, or follow-up work found
during QA and review.

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

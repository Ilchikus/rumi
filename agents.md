# Agent Workflow For Rumi New

This folder is the planning workspace for the fresh Rumi server/client rebuild.

Use this file as the first read before working here.

## Project Shape

Rumi New is a local-first/self-hosted workspace server with a web client.

Core model:

```text
Official web client / custom clients / CLI / agents / scripts
        |
        v
Rumi server API and event stream
        |
        v
Workspace runtime
        |
        v
Markdown files + SQLite index + watcher/reconciler
```

The server owns workspace behavior. Clients own interaction and presentation. The CLI starts, controls, and integrates with the server. Agents and scripts use the same API where possible.

The official web client is the default/reference client, not the only possible client. Build it on a reusable headless client layer for API commands, event subscriptions, save/conflict handling, editor boundaries, and shared state. Keep visual layout, styling, gestures, and product-specific interaction flows in the official UI layer. This leaves room for future user-built clients without making custom clients part of the immediate MVP.

## Read Order

Before changing plans or implementation, read:

1. [docs/docs.index.md](docs/docs.index.md)
2. [docs/vision.md](docs/vision.md)
3. [docs/workflow.md](docs/workflow.md)
4. [docs/testing.md](docs/testing.md)
5. The relevant record in [docs/Decisions/Decisions.db.md](docs/Decisions/Decisions.db.md)
6. The relevant milestone in [docs/Milestones/Milestones.db.md](docs/Milestones/Milestones.db.md)
7. The relevant task in [docs/Tasks/Tasks.db.md](docs/Tasks/Tasks.db.md)
8. Any relevant contract in [docs/Contracts/Contracts.db.md](docs/Contracts/Contracts.db.md)

## Simplicity And Reliability Rule

Before making changes, plan for the simplest reliable solution that fits Rumi's current model.

Prefer boring, direct, inspectable designs over clever abstractions. Add new layers, protocols, state machines, background work, or generalized APIs only when they remove real complexity or protect an important product boundary.

When planning or implementing, explicitly check:

- Can this be solved with the existing runtime, API, client state, or UI primitive?
- Is the proposed behavior easy to reason about, test, and recover from?
- Does it reduce the chance of data loss, stale UI, hidden coupling, or future migration pain?
- Is there a smaller vertical slice that proves the same direction?

If two approaches both work, choose the one with fewer moving parts and clearer failure modes.

## Work Pipeline

Every feature should move through this shape:

```text
decision
  -> milestone
  -> contract
  -> task
  -> tests
  -> implementation
  -> verification
```

Do not start by porting UI. Start by proving runtime behavior with tests.

## Statuses

Use these task statuses:

- `idea` - not ready to implement.
- `ready` - scoped enough to start.
- `doing` - actively being worked on.
- `verify` - implementation exists and needs validation.
- `done` - implementation and required tests are complete.
- `blocked` - cannot proceed without a decision or external input.
- `dropped` - intentionally abandoned.

## Core Rules

- Files are canonical.
- SQLite is a rebuildable index/cache.
- The runtime owns workspace commands.
- HTTP, CLI, tests, and future desktop shells call the same runtime.
- The official web client must not manually coordinate file writes, index writes, and event refreshes.
- Shared client behavior belongs in a headless client layer before it becomes embedded in React components.
- Watcher events are hints, not truth.
- Use normalized Rumi events, not raw filesystem events.
- Do not add required Rumi IDs to normal Markdown files.
- Do not use IDs in filenames.
- Do not bring Git/GitHub sync into the first runtime.
- Do not require browser local file APIs for core behavior.

## Frontend Component Rule

Default to shadcn-style local UI primitives for common controls and overlays.

Use custom components only when the interaction is domain-specific or the shadcn/Radix primitive does not fit the behavior cleanly. Keep custom components small, accessible, and aligned with the same tokens, spacing, and state conventions.

For menus, dialogs, popovers, inputs, buttons, and similar UI, first look for an existing local shadcn-style primitive or add one in `apps/web/src/components/ui/` before building one-off markup.

## Frontend Color Rule

Default the official web client to Tailwind's neutral palette, plus white and black. Do not introduce colored palettes for general layout, controls, borders, messages, decoration, or entity icons unless a product decision explicitly calls for color.

Sidebar entity icons use neutral `400` Phosphor outline icons: file for page, folder/folder-open for collapsed/expanded folders and workspaces, and table for database.

## Testing Rule

No meaningful feature is complete until its important behavior is covered by tests.

Coverage follows ownership:

- Runtime behavior needs runtime tests.
- Markdown behavior needs roundtrip tests.
- API behavior needs contract tests.
- CLI behavior needs CLI tests.
- Fragile UI wiring needs a small smoke test.

Do not add tests as paperwork. Add tests that protect the risky behavior.

## Task Template

Each task should include:

```markdown
## Goal

## Scope

## Out Of Scope

## Owner Layer

runtime | api | web | cli | editor | docs

## Required Coverage

- [ ] Runtime test
- [ ] Markdown/editor test
- [ ] API test
- [ ] CLI test
- [ ] UI smoke test

## Implementation Notes

## Done When
```

Only check coverage types that make sense for the feature.

## Rumi File Format

This planning folder uses Rumi's own format:

- Folder pages use `{folder}.index.md`.
- Databases use `{database}.db.md`.
- Records are Markdown files inside the database folder.
- Record metadata lives in normal YAML frontmatter.

Important databases:

- [docs/Decisions/Decisions.db.md](docs/Decisions/Decisions.db.md)
- [docs/Milestones/Milestones.db.md](docs/Milestones/Milestones.db.md)
- [docs/Tasks/Tasks.db.md](docs/Tasks/Tasks.db.md)
- [docs/Contracts/Contracts.db.md](docs/Contracts/Contracts.db.md)

## Context Capture Rule

Do not leave important new context only in chat.

When new durable context appears, store it in the `docs/` workspace before the turn is finished.

Choose the best home:

- New architecture/product choice -> `docs/Decisions/`
- New implementation unit -> `docs/Tasks/`
- New cross-layer boundary -> `docs/Contracts/`
- New milestone or scope change -> `docs/Milestones/`
- New unresolved product/architecture question -> `docs/open-questions.md`
- New lesson from old code or migration work -> `docs/codebase-lessons.md`
- New workflow/testing/source-layout convention -> the matching narrative doc in `docs/`

If the input changes an existing direction, update the relevant existing record instead of creating duplicates.

If the input creates concrete work, add or update a task with required coverage.

At the end of meaningful work, quickly ask:

- Did we make a durable decision?
- Did we introduce a new task?
- Did a contract between layers change?
- Did tests reveal a convention worth preserving?
- Did the user give a preference future agents should know?

If yes, update the matching file under `docs/`.

## Practical Bias

When unsure, choose the smallest vertical slice that proves the architecture:

```text
runtime command
  -> tests
  -> API route
  -> CLI usage
  -> minimal web usage
```

The goal is boring correctness before rich UI.

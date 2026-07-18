---
status: verify
type: feature
milestone: M02
owner_layer: cli
coverage:
  - cli
  - runtime
created: "2026-06-22"
updated: "2026-07-18"
---
# M02-002 CLI Serve Open Status

## Goal

Add the first CLI commands.

## Scope

- `rumi serve ./workspace`.
- `rumi open ./workspace`.
- `rumi status`.
- `rumi serve --verbose` for key workspace/API events.
- `rumi serve --log-level <level>` for explicit log control.
- High unprivileged port by default.
- Browser opening optional for headless Linux.

## Required Coverage

- [x] CLI test for missing workspace.
- [x] CLI test for status output.
- [x] CLI test for `--json` output shape.
- [x] Runtime test remains source for workspace behavior.

## Done When

- The CLI can launch or inspect a local workspace without duplicating runtime logic.

## Progress

`status`, `tree`, `page`, `index`, `search`, `snapshot`, `history`, database maintenance, and `serve`
commands exist. `serve` hosts the built official client by default when available and supports
`--api-only` or `--web-root` for headless/custom-client deployments.

The optional browser-launching `rumi open` convenience command remains before this task is `done`.

`serve` now uses Fastify/Pino logs with default quiet warning/error mode, `--verbose` for semantic event logs, and `--json-logs` for structured output.

---
status: doing
type: feature
milestone: M02
owner_layer: cli
coverage:
  - cli
  - runtime
created: "2026-06-22"
updated: "2026-06-22"
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

- [ ] CLI test for missing workspace.
- [ ] CLI test for status output.
- [ ] CLI test for `--json` output shape.
- [x] Runtime test remains source for workspace behavior.

## Done When

- The CLI can launch or inspect a local workspace without duplicating runtime logic.

## Progress

Initial `status`, `tree`, `page`, `index`, and `serve` commands exist. CLI-specific tests still need to be added.

`serve` now uses Fastify/Pino logs with default quiet warning/error mode, `--verbose` for semantic event logs, and `--json-logs` for structured output.

---
status: done
type: feature
milestone: M02
owner_layer: cli
coverage:
  - api
  - docs
created: "2026-06-22"
updated: "2026-06-22"
---
# M02-003 Server Logging Flags

## Goal

Make server logs useful for debugging local and Tailscale testing without inventing a custom logging system.

## Scope

- Use Fastify/Pino logger.
- Default to warning/error logs.
- Add `--verbose` for readable semantic logs.
- Add `--log-level <level>` for explicit control.
- Add `--json-logs` for structured output.
- Log key workspace/API events in server routes.

## Out Of Scope

- Log files.
- Log rotation.
- Hosted observability.
- Per-user audit trails.

## Owner Layer

server and cli

## Required Coverage

- [x] API/server tests still pass with default logging.
- [x] Typecheck covers CLI/server flag wiring.
- [x] Manual dev server run confirms pretty semantic logs.
- [x] Docs updated in CLI contract.

## Done When

- `rumi serve --verbose` prints useful human-readable events.
- Default mode avoids noisy successful request logs.
- JSON logs remain available for production/self-hosted use.

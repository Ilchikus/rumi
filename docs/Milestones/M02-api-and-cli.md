---
status: doing
order: 2
areas:
  - api
  - cli
  - runtime
depends_on:
  - M01
created: "2026-06-22"
updated: "2026-06-22"
---
# M02 API And CLI

## Goal

Expose the runtime through a small server API and CLI.

## Scope

- HTTP adapter for core commands.
- Event stream stub.
- `rumi serve`.
- `rumi open`.
- `rumi status`.
- `rumi index`.
- CLI direct runtime mode for maintenance.

## Exit Criteria

- Browser can call API to get tree/open page/save page.
- CLI can start server and run basic maintenance.
- API tests verify command shape and stale-write response.
- CLI tests verify output and exit behavior.

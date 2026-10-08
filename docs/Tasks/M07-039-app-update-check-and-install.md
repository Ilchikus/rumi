---
status: verify
type: feature
milestone: M07
release: "0.1.18"
owner_layer: api
coverage:
  - api
  - cli
  - ui-smoke
  - docs
created: "2026-10-05"
updated: "2026-10-05"
---
# M07-039 App Update Check And Install

## Goal

Show when a newer Rumi is published on npm and, where it is safe, let the user update and restart
from Settings. See [026](../Decisions/026-in-app-update-and-restart.md).

## Scope

- The CLI passes its package version into `startRumiServer`.
- `GET /api/app` returns `{ version, latestVersion, updateAvailable, update }`. The `update` field
  is `{ mode: "self" | "manual" | "disabled", command? }`.
  - `latestVersion` comes from `registry.npmjs.org/@rumi-md/server/latest` with a 5 s timeout and a
    6 h in-memory cache. Failures yield `null` and no indicator.
  - `updateAvailable` is true only when the latest version is semver-greater than the current one,
    so dev builds ahead of npm stay quiet.
  - The mode is `self` when the entry point's realpath is inside `npm root -g`, the request is
    authenticated with password auth or is a direct local request without proxy headers, and
    updates are enabled. Otherwise it is `manual`, with a command:
    `npm i -g @rumi-md/server@latest`, or the npx equivalent when running from the npx cache.
- `POST /api/app/update` is allowed only in `self` mode.
  - It runs `npm install --global @rumi-md/server@<latestVersion>` with `execFile` (no shell,
    pinned version).
  - On success it replies `{ status: "restarting", version }`, then restarts.
  - On failure it returns the npm stderr tail plus the manual command, and the server keeps
    running.
- Restart handoff in `rumi serve`:
  - The worker closes the server and runtime, flushing the index and stopping the watcher.
  - If unsupervised, the process becomes a supervisor and spawns `node <same argv>` with inherited
    stdio and `RUMI_SUPERVISED=1`. If already supervised, it exits with restart code 75.
  - The supervisor respawns on 75, exits with any other worker code, and forwards SIGINT/SIGTERM.
- `rumi serve --no-update-check` disables the registry request and reports mode `disabled`.
- Web:
  - A small accent dot appears next to Settings in the sidebar while `updateAvailable` is true.
  - Settings gets a Version row: "Rumi 0.1.17" plus either "Up to date", "0.1.18 available" with an
    Update button, or a copyable manual command.
  - Update first flushes pending page saves, then calls the endpoint. The button reads
    Updating…, then Restarting…. The client polls `/api/app` until the new version answers (about
    60 s budget), then reloads. Errors show inline with the manual command.

## Out Of Scope

- Automatic or scheduled updates, release channels, downgrades, and release-notes UI.
- Supporting package managers other than global npm for self-update.
- Restarting under a process manager that Rumi did not start (that path works through the same
  handoff without special handling).

## Owner Layer

api

## Required Coverage

- [ ] API tests for version comparison, cached registry failure, each mode (global, npx,
      non-loopback without auth, disabled), and update refusal outside `self` mode. The fetch and
      npm installer are injected.
- [ ] Update success test proving the restart hook runs after the reply. A failure test proving the
      server keeps serving.
- [ ] CLI test for the supervisor: a fake worker exiting 75 is respawned, other codes propagate, and
      signals are forwarded.
- [ ] UI smoke for the sidebar dot and the Settings states (up to date, self, manual, updating,
      error).
- [ ] Package smoke still passes. README documents `--no-update-check`. The API contract is
      updated.

## Implementation Notes

Keep the update module server-side and dependency-free: `fetch`, `execFile`, and `fs.realpath`.
Resolve `npm root -g` once, lazily, the first time `/api/app` is called. The supervisor should be
about 40 lines in the CLI and must not import the runtime.

## Done When

From a real global install of the previous version, clicking Update installs the latest version,
the same terminal keeps running Rumi, and the reloaded page shows the new version with no unsaved
edits lost.

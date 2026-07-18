---
status: accepted
areas:
  - server
  - web
  - hosting
impact: high
created: "2026-06-22"
updated: "2026-07-18"
---
# Server Runtime With Web Client

## Decision

Rumi New should be a local-first/self-hosted workspace server with a web client.

The server is the runtime. The browser is the primary UI. The CLI starts and controls the runtime.

## Why

Electron proved the product direction, but the main process, preload bridge, renderer, Git, watcher, and database responsibilities became tangled.

A server runtime gives one authority for files, indexes, watchers, commands, APIs, CLI, agents, and future collaboration.

## Consequences

- Offline use means localhost server plus browser.
- Self-hosting means the same server behind a domain or reverse proxy.
- Hosted Rumi can reuse the same tenant/workspace structure later.
- Browser local file APIs are not foundational.
- A normal server distribution serves the built official client from the same origin.
- `--api-only` and the typed API keep the server usable with custom clients and separate static
  hosting.

## Avoid

- Rebuilding Electron IPC as one HTTP endpoint per old method.
- Starting from a full UI port before the runtime is proven.

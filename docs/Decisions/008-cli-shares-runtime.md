---
status: accepted
areas:
  - cli
  - server
  - agents
impact: high
created: "2026-06-22"
updated: "2026-07-20"
---
# CLI Shares The Runtime

## Decision

The CLI is part of the product and must share the Workspace Runtime.

## Roles

```text
1. Server launcher
2. Maintenance tool
3. API client for users, scripts, and agents
```

## Early Commands

```text
rumi serve ./workspace
rumi open ./workspace
rumi status
rumi index ./workspace
rumi reconcile ./workspace
rumi tree ./workspace
```

## Consequences

- CLI commands must not mutate files through separate logic.
- Local maintenance commands can load runtime directly.
- Remote/hosted commands can call the server API.
- `--json` output should be stable for scripts.
- The public npm package is `@rumi-md/server`, while its executable remains `rumi`.
- The published CLI bundles Rumi's internal runtime/server code and the official production web
  client so consumers do not install unpublished workspace packages or build the repository.

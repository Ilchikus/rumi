# Source Layout

The `rumi-new/` folder is both the planning workspace and the future codebase.

Docs live in `docs/`.

Code lives in `apps/` and `packages/`.

## Current Shape

```text
rumi-new/
  apps/
    server/
    cli/
    web/

  packages/
    contracts/
    markdown/
    runtime/
    workspace-format/

  docs/
```

## Apps

`apps/server`

The HTTP server and event stream adapter. It depends on the runtime. It should not own workspace behavior itself.

`apps/cli`

The `rumi` command. It can load the runtime directly for local maintenance commands, or call the server API later for remote/self-hosted workspaces.

`apps/web`

The browser client. It should talk to the server API and event stream. It should not read local files or update indexes directly.

Current dev mode uses Vite with `/api` proxied to the local Rumi server on port `3000`.

The frontend stack is React, Vite, Tailwind, shadcn-style local UI primitives, and lucide icons. ProseMirror will be added when the editor slice begins.

Tailwind config currently uses `tailwind.config.cjs`. Keep it that way unless the dev server is verified after changing it; the TS config variant caused Vite dev/PostCSS to compile base CSS without utilities or throw config-loading errors.

## Packages

`packages/runtime`

The core workspace runtime. This owns workspace commands such as `getTree`, `openPage`, `savePage`, `renameNode`, `queryDatabase`, and `rebuildIndex`.

`packages/workspace-format`

Workspace path and file convention helpers: `.index.md`, `.db.md`, `.assets/`, `.rumi/`, internal/hidden paths, and node classification.

`packages/markdown`

Markdown/frontmatter parsing and serialization. This package protects the durable file format and should grow strong roundtrip tests.

`packages/contracts`

Shared TypeScript contracts for runtime results, API payloads, events, and page documents.

`packages/api-client`

Typed client helpers used by the web app, CLI later, and scripts/agents later.

## Dependency Direction

Keep dependencies flowing inward:

```text
apps/web    -> contracts
apps/web    -> api-client
apps/server -> runtime + contracts
apps/cli    -> runtime + server + contracts

api-client -> contracts
runtime -> workspace-format + markdown + contracts
markdown -> contracts
workspace-format -> no app dependencies
contracts -> no app dependencies
```

Rules:

- Runtime must not depend on server, web, or CLI.
- Web must not depend on Node filesystem APIs.
- CLI must not implement separate workspace behavior.
- Server routes should be thin adapters over runtime commands.
- Contracts should stay boring and shared.

## Distribution

For local MVP, distribution can bundle:

```text
server + built web client + CLI
```

For hosted/self-hosted later, the pieces can split:

```text
web static assets
server API/event stream
CLI remote API client
```

The codebase should keep those pieces separable even if the first install ships them together.

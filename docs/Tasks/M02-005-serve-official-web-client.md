---
status: done
type: feature
milestone: M02
owner_layer: api
coverage:
  - api
created: "2026-07-18"
updated: "2026-07-18"
---
# M02-005 Serve Official Web Client

## Goal

Ship the official web client with the headless server without coupling workspace behavior to it.

## Delivered

- The server serves a supplied or discovered Vite production build with SPA fallback.
- Fingerprinted assets receive long-lived cache headers; `index.html` does not.
- Unknown API routes keep structured JSON 404 responses.
- `rumi serve --api-only` disables the client for custom-client deployments.
- `rumi serve --web-root <path>` selects an explicit official-client build.

All workspace behavior remains behind the same typed API used by custom clients.

---
status: verify
type: feature
milestone: M03
owner_layer: web
coverage:
  - api
  - ui-smoke
created: "2026-06-22"
updated: "2026-06-22"
---
# M03-001 Web Shell And File Tree

## Goal

Build the first web client shell against the server API.

## Scope

- Workspace route.
- Sidebar tree from API.
- Open page from tree.
- Basic loading/error states.
- Event stream connection stub.

## Required Coverage

- [x] API test already covers tree response.
- [ ] UI smoke/manual check opens workspace and page.

## Done When

- No React code reads local files or updates indexes directly.
- The shell proves the web-client/server split.

## Progress

React/Vite shell exists with Tailwind and shadcn-style primitives. It loads workspace info, reads the tree through the API, opens pages through the API, and does not read local files directly.

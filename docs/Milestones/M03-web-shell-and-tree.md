---
status: verify
order: 3
areas:
  - web
  - api
depends_on:
  - M02
created: "2026-06-22"
updated: "2026-06-22"
---
# M03 Web Shell And Tree

## Goal

Build the minimal browser UI shell against the server API.

## Scope

- Workspace route.
- Sidebar tree loaded from API.
- Open page route/state.
- Basic page display.
- Event subscription wiring.
- Sidebar CRUD for page/folder operations.

## Exit Criteria

- Web client loads tree from server.
- User can open a Markdown page.
- Client state is UI state only.
- No raw file/index coordination in React.

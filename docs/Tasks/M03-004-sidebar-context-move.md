---
status: verify
type: feature
milestone: M03
owner_layer: web
coverage:
  - runtime
  - ui-smoke
  - docs
created: "2026-06-23"
updated: "2026-06-23"
---
# M03-004 Sidebar Context Move

## Goal

Move workspace items from the sidebar context menu using the server runtime command.

## Scope

- Add a Move action to item dropdown and right-click context menus.
- Show a destination picker dialog for root, folders, and databases.
- Disable invalid destinations: current parent, self/descendants, and destinations with a name conflict.
- Call `moveNode` through `@rumi/api-client`.
- Refresh the tree and preserve the active selection where possible.

## Out Of Scope

- Drag and drop.
- Index rebuilds or SQLite index writes.
- External filesystem watcher reconciliation.
- Bulk move.

## Owner Layer

web

## Required Coverage

- [x] Existing runtime test covers physical move.
- [ ] UI smoke/manual check for context-menu move, invalid destinations, and active page preservation.

## Progress

Implemented context-menu move with a shadcn-style destination dialog. The operation physically moves files/folders through the existing runtime/API command and does not rebuild an index.

## Done When

- Context menu can move an item to a valid destination.
- Invalid destinations cannot be selected.
- Open moved pages/folder companion pages stay selected after move.

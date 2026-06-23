---
status: verify
type: feature
milestone: M03
owner_layer: web
coverage:
  - runtime
  - api
  - ui-smoke
created: "2026-06-22"
updated: "2026-06-22"
---
# M03-002 Sidebar CRUD

## Goal

Make the sidebar the first real application surface.

## Scope

- Create page.
- Create folder with `.index.md` companion.
- Rename page/folder from the item action modal.
- Delete page/folder from the item action modal with confirmation.
- Open item actions by right-click on desktop.
- Open item actions from the active item's three-dot button on mobile.
- Refresh tree after mutations.
- Keep React as an intent surface over server commands.

## Out Of Scope

- Database rendering.
- Polished dialogs.
- Reference repair.
- Safe trash.
- Move action. This is deferred until the destination picker exists.

## Interaction Notes

The sidebar should not show rename/delete controls globally. Item-level actions belong to the selected node:

- Desktop: right-click a sidebar item to open actions.
- Mobile: tap the item first, then use the three-dot button shown only on the active item.
- The same modal should power both entry points so rename/delete behavior stays consistent.

## Owner Layer

web plus runtime/API commands.

## Required Coverage

- [x] Runtime test for create page/folder.
- [x] Runtime test for rename page/folder companion.
- [x] Runtime test for move/delete.
- [x] API test for CRUD route flow.
- [ ] Manual UI smoke test from browser/phone.

## Done When

- Sidebar CRUD works through the server API.
- React does not mutate local file state directly.
- Manual smoke test confirms the workflow against `rumi-new/docs`.

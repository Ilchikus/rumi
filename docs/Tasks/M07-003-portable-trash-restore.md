---
status: verify
type: feature
milestone: M07
owner_layer: runtime
coverage:
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-07-20"
updated: "2026-07-20"
---
# M07-003 Portable Trash And Restore

## Goal

Make all workspace-content deletion recoverable without depending on an operating-system trash
implementation.

## Delivered

- Workspace-local `.rumi/trash/` payload and metadata storage.
- Safe deletion for pages, folders, databases, uploaded assets, and other files.
- Original-path restore with missing-parent creation and collision-safe fallback names.
- Folder/database companion rename handling and revision-object continuity.
- Typed runtime, HTTP, and client list/restore commands.
- Bottom sidebar Trash entry, count, listing, original paths, deletion times, and restore actions.
- Delete confirmation and completion copy that accurately describes moving to Trash.

## Coverage

- [x] Runtime coverage for every supported item kind, collisions, companion names, and protected paths.
- [x] API list/delete/restore flow.
- [x] Typecheck and production web build.
- [ ] Manual browser smoke test for sidebar navigation and restore feedback.

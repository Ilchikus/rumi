---
status: verify
type: feature
milestone: M03
owner_layer: web
coverage:
  - runtime
  - ui-smoke
  - docs
created: 2026-06-23
updated: 2026-06-23
---
# M03-003 Sidebar Interactions And Layout

## Goal

Bring the new web sidebar up to the expected workspace navigation baseline without porting old Electron renderer logic.

## Scope

- Expand and collapse tree containers with caret state.
- Inline create rows for pages and folders.
- Inline rename from double-click or item menu.
- Item dropdown menus and root create menu using shadcn-style primitives.
- Delete action.
- Active ancestor guides.
- Resizable and collapsible sidebar shell.
- Sidebar refresh behavior from normalized Rumi events.
- Shared portable name sanitization for UI and runtime commands.

## Out Of Scope

- Workspace switcher.
- Database-specific sidebar commands.
- Native desktop reveal-in-file-manager behavior.
- Drag and drop.
- External filesystem watcher/reconciler.

## Owner Layer

web, runtime

## Required Coverage

- [x] Runtime test for slash/name sanitization.
- [ ] UI smoke/manual check for create, rename, delete, resize, collapse, and two-client refresh.

## Progress

Implemented a fresh server-command-oriented sidebar with shadcn-style dropdown menus, inline create/rename, caret expansion, active ancestor guides, delete, persisted resize/collapse state, and normalized event refresh behavior.

Follow-up UI pass switched app tokens to neutral/white/black defaults, reduced nested tree indentation to roughly 20px per level, and settled sidebar entity marks on neutral `400` Phosphor outline icons: file for page, folder/folder-open for collapsed/expanded folders and workspaces, and table for database.

## Done When

- Sidebar CRUD no longer uses `window.prompt`.
- Rename preserves the active page when possible.
- Runtime commands accept user-friendly slash replacement instead of rejecting slash-like names.
- Sidebar reacts to command events from other clients.
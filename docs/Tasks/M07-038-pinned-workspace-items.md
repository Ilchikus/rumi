---
status: done
type: feature
milestone: M07
release: "0.1.17"
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-29"
updated: "2026-08-31"
---
# M07-038 Pinned Workspace Items

## Goal

Keep important pages, folders, and databases immediately available above the main workspace tree
and expose one identical item-action menu from the editor header, sidebar, and breadcrumbs.

## Scope

- Add `Pin` to the shared workspace-item action model for pages, folders, and databases; replace it
  with `Unpin` when the target is already pinned. Use only Pinned, Pin, and Unpin in product UI and
  implementation names.
- Render pinned items above the canonical sidebar tree without a visible section label. Render only
  pinned nodes: a pinned node whose nearest pinned ancestor is also present nests under that
  ancestor, while a pinned node without a pinned ancestor appears as a flat root row.
- Reuse canonical tree nodes and the same row interactions for open, prefetch, expansion, selection,
  inline rename by double-click, action-menu access, and kind icons. The pinned projection must
  never become a second content identity or include unpinned descendants as placeholders.
- Place a dedicated Pin/Unpin button immediately after the dots menu on each pinnable sidebar row.
  In the canonical tree, an unpinned regular icon appears on row hover or keyboard focus while a
  pinned filled icon remains visible. In the separate pinned projection, the filled icon is also
  hover/focus-only. Direct controls use a light neutral color that returns to the standard muted
  color on direct hover. Activating one toggles pin state without opening the item. Keep Pin/Unpin
  in the shared menu with one stable regular icon style independent of state.
- Store ordered canonical node paths in browser-local state scoped to the workspace root. Preserve
  insertion order, deduplicate entries, repair pinned paths after rename or move, and prune missing
  or deleted targets when the authoritative tree changes. Manual drag reordering is deferred.
- Use the same shared action model and renderer for sidebar row buttons, sidebar right-click,
  breadcrumb right-click, and the editor-header item-actions button. Route shared actions through
  the same App-owned callbacks and dialogs regardless of origin.
- Move `See revisions` into that shared model for every non-root node with an openable page or
  companion so the menus remain identical without removing revision history from the header.
- Keep the workspace root, system pages, Uploads, Trash payloads, assets, and generic files
  unpinnable.

## Out Of Scope

- Syncing pinned state through workspace files, the runtime, API, or other browsers.
- Drag-and-drop or keyboard reordering of pinned rows.
- Pinning system pages, Trash items, Uploads, assets, or the workspace root.
- Duplicating unpinned descendants beneath a pinned container.

## Owner Layer

web

## Required Coverage

- [x] Storage tests for workspace isolation, ordering, deduplication, malformed input, path repair,
      and missing-target pruning.
- [x] Projection tests for flat leaves, nested pinned ancestors, skipped unpinned ancestors, and
      page/folder/database support.
- [x] Shared action-model tests for Pin versus Unpin, root/immutable exclusions, and revision
      eligibility.
- [x] Component tests proving header, sidebar buttons, sidebar pointer menus, pinned rows, and
      breadcrumbs use the same renderer and callbacks.
- [x] Interaction tests for Pin/Unpin from multiple menu origins and immediate sidebar projection.
- [x] Sidebar-row tests for control order, canonical-versus-projection visibility, neutral color,
      filled pinned presentation, and direct Pin/Unpin without navigation.
- [x] Browser smoke for persistence after reload, workspace isolation, nesting, rename/move repair,
      delete pruning, and keyboard menu behavior.
- [x] Editor-interaction/sidebar contract update.

## Implementation Notes

Keep the durable workspace model unchanged. Pinned state is a browser preference containing paths;
every rendered item must resolve back to the current authoritative `WorkspaceNode`. Build a small
derived projection by attaching each resolved node to its nearest pinned ancestor, without cloning
or mutating the canonical tree beyond presentation-only node copies.

The shared action model receives current pin and openable-page capability state. Presentation
surfaces render that model; they do not maintain separate action lists.

## Dependencies

- `M07-006-url-synchronized-workspace-navigation.md`
- `M07-015-persistent-startup-and-scroll-restoration.md`
- `M07-022-sidebar-context-menu-keyboard-contract.md`
- `M07-036-shared-breadcrumb-context-actions.md`

## Verification

- Eight focused storage, projection, action-model, header, breadcrumb, sidebar, focus, and App-wiring
  suites pass with 51 tests; repository typecheck passes.
- The integrated `0.1.17` gate passes with 86 test files and 743 tests, repository typecheck, both
  production builds, and the installable server-package smoke.
- Production browser QA confirms nested pins survive reload, follow parent rename and move, prune
  after Trash, stay pruned after restore, remain isolated when the served workspace changes, and
  activate shared menu actions from the keyboard.

## Done When

- Pinning any page, folder, or database immediately adds one resolved row above the main tree and
  changes every menu origin to `Unpin`.
- Each pinnable sidebar row exposes its direct control after the menu. Canonical pinned rows keep
  the filled glyph visible; unpinned rows and rows in the pinned projection reveal it on hover/focus.
- Pinned descendants nest only under pinned ancestors; otherwise they remain flat.
- Header, sidebar, pinned rows, and breadcrumbs expose the same ordered actions and invoke the same
  App-owned handlers for the same node.
- Pinned state survives reload per workspace, follows rename/move, and removes stale targets.
- Focused tests, the full release checks, and manual browser QA pass.

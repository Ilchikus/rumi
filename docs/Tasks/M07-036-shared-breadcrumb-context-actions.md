---
status: done
type: feature
milestone: M07
release: "0.1.17"
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-22"
updated: "2026-08-31"
---
# M07-036 Shared Breadcrumb Context Actions

## Goal

Expose workspace-item context actions from address-bar breadcrumbs and keep those actions identical
to the matching sidebar item's context menu.

## Scope

- Open a context menu for a real workspace breadcrumb on right-click and macOS Control-click
  without navigating or changing the current page.
- Extract one shared workspace-item action model/menu used by sidebar row action buttons, sidebar
  pointer context menus, and breadcrumb context menus. The same node and capability state must
  produce the same ordered actions on every surface.
- Add `Copy URL` and `Copy relative path` to the shared item actions. Copy URL uses the node's
  canonical application route and current origin. Copy relative path uses the node's canonical
  workspace path, preferring its openable Markdown companion when that is the existing page-action
  target.
- Retain the current kind-specific creation matrix: folders can create pages, folders, and
  databases; databases can create pages; ordinary pages cannot create children.
- Retain Rename, Move, folder/database conversion, and Move to Trash for mutable nodes, routed
  through the existing App callbacks and runtime commands.
- Give the workspace-root breadcrumb the safe root action subset: root child creation, Copy URL,
  and Copy relative path when an openable root page exists. Never offer root rename, move,
  conversion, or deletion.
- Do not attach workspace-item actions to Settings, Uploads, Trash, or Trash-item breadcrumb labels.
- Preserve ordinary breadcrumb click navigation and sidebar menu behavior.
- Match the established context-menu keyboard contract: focus the first enabled action, use native
  roving navigation and Enter activation, close with Escape, and restore focus without scrolling
  when the originating breadcrumb or sidebar row still exists.

## Out Of Scope

- New mutation commands or different rename/move/delete semantics.
- Context actions for system-page labels or deleted Trash payloads.
- Adding Pinned items, tags, or asset-specific actions to the generic workspace-node menu. Pinned
  items are added later by `M07-038`.
- Changing the separate current-page File actions beyond reusing canonical copy-value helpers.
  `M07-038` later unifies that surface with the shared item menu.

## Owner Layer

web

## Required Coverage

- [x] Pure action-model tests for page, folder, database, workspace-root, and immutable/system
      contexts.
- [x] Component tests proving sidebar buttons, sidebar context menus, and breadcrumbs render the
      same ordered action set for the same node.
- [x] Clipboard tests for canonical page, folder companion, database companion, and root URL/path
      values, including route collisions and encoded paths.
- [x] Interaction tests for right-click, macOS Control-click, no accidental navigation, keyboard
      activation, Escape, and focus restoration without scroll.
- [x] App wiring tests proving actions receive the clicked breadcrumb node rather than the current
      leaf selection.
- [x] Browser smoke test for parent-breadcrumb copy, rename, move, and Trash actions while a child
      page is open.
- [x] Editor-interaction/navigation contract update.

## Implementation Notes

Keep the shared layer declarative: it should decide which actions apply and render their labels,
icons, separators, and shortcuts, while App-owned callbacks continue to perform navigation,
clipboard writes, and runtime mutations. Do not duplicate a second move dialog or mutation state in
the header.

The existing global native-context-menu suppression means each breadcrumb must explicitly handle
the secondary gesture. Reuse the established sidebar focus behavior rather than introducing a new
menu implementation.

## Dependencies

- `M03-004-sidebar-context-move.md`
- `M07-006-url-synchronized-workspace-navigation.md`
- `M07-007-application-shell-address-bar.md`
- `M07-017-editor-selection-and-clipboard-polish.md`
- `M07-022-sidebar-context-menu-keyboard-contract.md`

## Verification

- Six focused shared-model, sidebar, header, interaction, focus, and copy-helper suites pass with 51
  tests, including clicked-ancestor targeting and macOS Control-click.
- The full repository suite passes with 86 files and 743 tests; the web subset passes with 77 files
  and 626 tests. Repository typecheck, both production builds, diff checks, and the installable
  server-package smoke pass.
- Production browser QA confirms a parent breadcrumb copies its companion path, renames and moves
  the parent while retaining the open child, and moves that parent subtree to Trash.

## Done When

- Right-clicking any real workspace breadcrumb opens the same valid actions as right-clicking the
  corresponding sidebar node, including Copy URL and Copy relative path.
- Actions operate on the clicked ancestor, not the current leaf, and share the existing runtime and
  clipboard code paths.
- Mouse, macOS Control-click, keyboard, dismissal, and focus restoration behavior pass automated
  coverage and browser QA.
- Focused tests and the full release checks pass.

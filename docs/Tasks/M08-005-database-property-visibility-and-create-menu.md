---
status: done
type: feature
milestone: M08
owner_layer: web
coverage:
  - ui-smoke
created: 2026-07-23
updated: 2026-07-23
---
# M08-005 Database Property Visibility And Create Menu

## Goal

Give table views and record pages independent property visibility, and replace inline property
creation with one keyboard-first anchored menu.

## Scope

- Add `Hide in this view` to a visible table-property header menu.
- Add a `Show property` submenu to table header context menus so hidden columns can be restored
  without a toolbar visibility control.
- Honor `recordPage.hiddenProperties` in the shared record-page properties panel.
- Add record-page hide/restore controls without changing any table view.
- Build one parameterized property-create menu for table headers, database records, and ordinary
  pages.
- Use a name/search input, icon grid, type-ahead focus, arrow navigation, and the two-Enter
  confirm/create flow.
- Preserve the caller-specific property type catalog.

## Out Of Scope

- Property-level permissions.
- Per-record visibility.
- Property ordering outside table `columns`.

## Owner Layer

web

## Required Coverage

- [x] Component tests prove table and record-page visibility are independent and restorable.
- [x] Component tests prove hiding never deletes frontmatter values.
- [x] Keyboard tests cover default Text focus, `Dat` focusing Date, grid arrows, first Enter type
  confirmation, second Enter creation, Escape, empty names, and duplicates.
- [x] UI smoke test creates a property from both a table and a record page and verifies the intended
  visibility defaults.

## Implementation Notes

Do not duplicate the current `DatabaseView` and `PageProperties` creation forms. Extract a shared
menu whose caller supplies available types and the final create command.

## Done When

- Visibility changes affect only their documented surface, and every current property-create
  trigger uses the new menu with the same keyboard behavior.

## Verification

- Property-menu and page-presentation suites pass.
- Browser smoke created a Date property through the two-Enter flow, hid/restored a table column
  exclusively from table header context actions, and independently hid/restored the same property
  on record pages.

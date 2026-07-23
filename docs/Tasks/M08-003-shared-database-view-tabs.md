---
status: done
type: feature
milestone: M08
owner_layer: web
coverage:
  - markdown
  - ui-smoke
created: 2026-07-23
updated: 2026-07-23
---
# M08-003 Shared Database View Tabs

## Goal

Render and manage all supported database views as real tabs on full database pages and embeds.

## Scope

- Refactor the shared `DatabaseView` to select/query by view ID instead of always using index zero.
- Render accessible large pill tabs without overlap or translation. Fill the active pill with a
  neutral background and use a neutral outline for inactive pills. Keep the table heading separate
  with top and bottom rules only.
- Place tabs in the same transparent toolbar row as the source/search/filter/new controls on full
  and embedded database surfaces, with the embedded database source between Filter and New. Use an
  explicit original/embed variation of one shared component rather than a generic toolbar slot or
  separate renderers. Align the bottom of the non-tab controls with the bottom of the pill strip.
- Add create, rename, duplicate, and delete view menus.
- Scope browser-local column widths by stable view ID.
- Persist an embedded database's selected view ID in its `db` fence while keeping full-page tab
  selection in client navigation state.
- Fall back to the first supported view when an embed references a missing view.

## Out Of Scope

- Filter editing.
- Non-table view renderers.
- View drag/reordering.

## Owner Layer

web

## Required Coverage

- [x] UI component tests cover multiple same-type tabs, active/inactive styling, keyboard
  navigation, and view menu constraints.
- [x] Markdown/editor roundtrip test covers an embedded stable view ID.
- [x] UI smoke test proves the same saved view renders on the database page and in an embed.

## Implementation Notes

Keep full and embedded rendering on the existing shared component. Its explicit embed variation
accepts only the source link/dropdown; pass controlled active-view state from the embed NodeView
instead of forking a second database table. Treat an absent embed view as empty state rather than
reserving `table`, because `table` is also a valid generated stable view ID.

## Done When

- Multiple table views are selectable and manageable in both surfaces without using type as
  identity.

## Verification

- Component and Markdown roundtrip suites pass.
- Browser smoke covered full-page and two embedded instances, including explicit embed selection
  persistence and no passive rewrite merely from opening an embed.

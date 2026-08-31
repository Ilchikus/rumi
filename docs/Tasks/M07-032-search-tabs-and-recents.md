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
# M07-032 Search Tabs And Recents

## Goal

Make Command/Control-K faster to operate from the keyboard by cycling its result tabs with Tab and
adding a browser-local Recent view for workspace documents the user opened lately.

## Scope

- Treat `All`, `Pages`, `Folders`, `Databases`, and `Recent` as one accessible tab list in the
  search dialog.
- While the search dialog has focus, Tab selects the next tab and Shift-Tab selects the previous
  tab, wrapping at both ends and keeping focus in the query input so typing can continue.
- Preserve the current query when tabs change. Reset result selection to the first visible item and
  keep Arrow-Up/Down, Enter, pointer hover, and click behavior coherent with the newly active tab.
- Keep the existing server-indexed request, kind filters, debounce, and stale-response guards for
  the first four tabs.
- Record a recent entry only after a workspace document opens successfully. Include ordinary pages,
  database records, folder pages, database pages, and the workspace home page when it has an
  openable companion; exclude Settings, Trash, trashed pages, and failed navigation.
- Store recents browser-locally per workspace, newest first, deduplicated by canonical node path,
  and bounded to 50 entries. The current page may be the first entry.
- Resolve recent paths against the authoritative tree before rendering. Prune deleted or otherwise
  missing entries, replace paths after successful in-app rename/move operations, and never treat
  browser storage as content identity.
- Show recents without a server search request. When the query is non-empty, filter recent titles
  and paths locally; an empty query shows the complete bounded recent list.
- Give the tabs correct tab-list semantics, active state, and keyboard/focus behavior.

## Out Of Scope

- Synchronizing recents through workspace files or the server.
- Including system pages, Trash items, or arbitrary assets in recents.
- Changing server search ranking, indexing, or result snippets.
- A separate recent-pages system page or configurable history length.

## Owner Layer

web

## Required Coverage

- [x] Component interaction tests for forward/reverse wrapping, retained input focus, query
      preservation, and selected-result reset.
- [x] Recent-history unit tests for workspace isolation, deduplication, ordering, the 50-entry
      bound, invalid storage, rename/move replacement, and missing-path pruning.
- [x] App wiring test proving only successful document opens are recorded and system/failed opens
      are excluded.
- [x] Search tests proving Recent avoids API requests while indexed tabs retain debounce, filters,
      and stale-response protection.
- [x] UI smoke test for keyboard-only tab cycling, recent result navigation, and reopening the
      dialog after a browser reload.
- [x] Search/navigation contract documentation update.

## Implementation Notes

Create a dedicated recent-document preference helper. Do not reuse `pageVisitHistoryRef`: that stack
exists to choose a surviving destination after deletion, is session-only, and is intentionally
consumed during fallback navigation.

Recent records should hold only the minimum path/kind information needed to resolve a current tree
node. Derive display names, open paths, and canonical routes from the fresh tree so cached labels do
not become a second source of truth.

## Dependencies

- `M07-002-server-indexed-search.md`
- `M07-006-url-synchronized-workspace-navigation.md`
- `M07-015-workspace-startup-and-session-navigation.md`

## Verification

- The search dialog, recent-history helper, and App wiring suites pass with 12 focused tests.
- The integrated `0.1.17` gate passes with 86 test files and 743 tests, repository typecheck, both
  production builds, and the installable server-package smoke.
- Production browser QA confirms reverse wrapping to Recent, retained query-input focus, recent
  result navigation, and persistence after a full reload.

## Done When

- Tab and Shift-Tab cycle every search tab in both directions without moving focus out of the query
  input.
- Recent shows the current workspace's valid recent documents in deterministic newest-first order,
  survives reload, and opens items through the normal navigation path.
- Indexed search behavior is unchanged outside the new tab/navigation behavior.
- Focused tests, the full release checks, and manual browser QA pass.

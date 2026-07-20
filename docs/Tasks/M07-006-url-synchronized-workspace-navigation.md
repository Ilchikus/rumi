---
status: verify
type: feature
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - api
  - docs
created: 2026-07-20
updated: 2026-07-20
---
# M07-006 URL-Synchronized Workspace Navigation

## Goal

Give every navigable workspace view a shareable, refreshable browser URL while keeping the React
application shell mounted and visually stable.

## Delivered

- Extensionless routes that mirror the real workspace folder hierarchy, plus `/trash`; database
  records naturally use `/<database name>/<record name>`.
- Conventional lowercase slugs: whitespace becomes one hyphen, ordinary hyphens and underscores
  remain valid, and deterministic numeric suffixes disambiguate sibling spacing, punctuation,
  case, page/directory, and reserved Trash collisions.
- History API push navigation for sidebar, search, internal links, records, newly created items, and
  Trash.
- Back/Forward restoration without full document reload or layout remount.
- Current-route replacement after rename, move, external move events, and deletion.
- Direct-route restoration after page refresh, with last-opened-page fallback only for `/`.
- Server SPA fallback coverage while unknown API routes remain structured 404 responses.

## Coverage

- [x] Unit coverage for hierarchy-based URLs, lowercase and whitespace normalization, preserved
  hyphens/underscores, Unicode, nested database records, numeric collision suffixes,
  page/directory collisions, Trash, home, and invalid routes.
- [x] Server integration coverage for deep-link fallback.
- [x] Typecheck and production build.
- [ ] Manual browser smoke for sidebar navigation, rename URL replacement, Back/Forward, and refresh.

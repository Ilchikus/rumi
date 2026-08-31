---
status: done
type: feature
milestone: M07
release: "0.1.17"
owner_layer: runtime
coverage:
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-08-22"
updated: "2026-08-31"
---
# M07-034 Uploads Library

## Goal

Add an Uploads system page where users can browse and manage the workspace assets that are otherwise
hidden from the normal content tree.

## Scope

### Runtime And API

- Add a typed `listAssets` runtime command that returns supported regular files beneath the
  canonical `.assets/` directory, including supported files added by external tools.
- Return workspace-relative path, file name, content type, byte size, and modified time. Never
  expose absolute filesystem paths, `.rumi` internals, Trash payload paths, temporary uploads, or
  symlink targets.
- Use a deterministic newest-modified-first order with path as the tie-breaker.
- Expose the inventory through `GET /api/assets` and the typed API client; retain the existing
  `POST /api/assets` upload contract on the same resource.
- Reuse `readAsset` for previews/downloads, `renameNode` for collision-safe rename and reference
  repair, and `deleteNode` for recoverable Move to Trash. Do not add direct permanent deletion.

### Official Web Client

- Add `/uploads` as a reserved, deep-linkable system route alongside `/settings` and `/trash`.
  Top-level workspace content naturally named Uploads must continue to work through the existing
  collision suffix rule.
- Add an Uploads entry to the bottom sidebar system-page group and show `Workspace / Uploads` in
  the address bar without treating Uploads as a workspace node.
- Render loading, error, empty, and populated states in the shared editor-page layout. Use safe
  thumbnail previews for image formats and clear type icons for other supported files; show name,
  size, type, and modified time without reading entire assets into application state.
- Provide keyboard-accessible item actions for Preview/Open, Download, Copy URL, Copy relative
  path, Rename, and Move to Trash. The URL must use the authenticated asset endpoint, and the copied
  path must be canonical and workspace-root-relative.
- Use the runtime-selected path after a rename collision, refresh Trash after deletion, and keep
  the Uploads inventory coherent after normalized asset, tree, delete, and restore events.
- Keep permanent deletion and restore in Trash, preserving the existing deletion model and user
  language.

## Out Of Scope

- Asset folders, tags, captions, search, sorting controls, or custom metadata.
- Bulk actions, drag reordering, duplicate detection, or binary clipboard writes.
- Editing or transcoding asset contents.
- Video playback controls, PDF rendering, or generated thumbnails for non-image files.
- Moving assets outside `.assets/` or permanently deleting them from Uploads.

## Owner Layer

runtime, with API and web adapters.

## Required Coverage

- [x] Runtime tests for empty/missing `.assets`, deterministic metadata/order, nested supported
      files, unsupported entries, symlinks, and external additions/removals.
- [x] Runtime tests proving Uploads rename uses collision-safe paths/reference repair and deletion
      moves the asset to Trash.
- [x] API/client contract tests for authenticated `GET /api/assets`, response shape, upload-route
      coexistence, invalid/unreadable files, and no filesystem-path leakage.
- [x] Route tests for `/uploads`, case/trailing-slash handling, direct loads, and a root workspace
      item whose natural slug is `uploads`.
- [x] Component tests for loading/error/empty states, safe image preview URLs, metadata formatting,
      action availability, rename results, clipboard values, and Trash refresh.
- [x] Event-refresh tests covering upload, external changes, rename, delete, and restore.
- [x] Browser smoke test for direct navigation, image preview, copy, rename, download, Move to Trash,
      and restore.
- [x] Runtime/API/file-format/navigation contract updates.

## Implementation Notes

Keep the inventory server-owned because `.assets/` is deliberately hidden from `getTree`. The UI
must not infer the library from currently open Markdown references: unused uploads are still valid
assets, while a document reference may be stale or external.

Do not load file bytes during inventory listing. Preview and download URLs should retain existing
asset response hardening, including SVG sandboxing and `nosniff` behavior.

## Dependencies

- `M07-003-portable-trash-restore.md`
- `M07-008-workspace-settings.md`
- `M07-009-system-pages-and-reserved-routes.md`
- `M07-025-svg-asset-pipeline-and-reference-repair.md`

## Verification

- The runtime, API client/server/auth, route, sidebar/header, Uploads component, and event-refresh
  suites pass with 134 focused tests, including unreadable-directory error propagation.
- The integrated `0.1.17` gate passes with 86 test files and 743 tests, repository typecheck, both
  production builds, and the installable `@rumi-md/server@0.1.17` package smoke, including
  `GET /api/assets`.
- Production browser QA confirms direct `/uploads` navigation, a loaded SVG preview, canonical copy
  values, preview/download targets, rename, Move to Trash, and restore back into the inventory.

## Done When

- `/uploads` lists the current safe `.assets/` inventory without exposing hidden filesystem details.
- Users can preview/open, download, copy, rename, and move an asset to Trash through runtime-owned
  commands, and restored or externally changed assets reappear correctly.
- Uploads deep links and reserved-name collisions behave like the existing Settings and Trash pages.
- Focused tests, the full release checks, package smoke, and manual browser QA pass.

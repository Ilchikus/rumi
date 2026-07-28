---
status: accepted
areas:
  - runtime
  - files
  - api
  - web
  - security
impact: high
created: "2026-07-20"
updated: "2026-07-28"
---
# Portable Workspace Trash

## Decision

All user-content deletion commands move their complete payload into `.rumi/trash/` instead of
calling an operating-system trash service or permanently removing it. This applies to pages,
folders, folder-backed databases, uploaded assets, and other workspace files.

Each trash entry has a unique directory containing the untouched payload and `metadata.json` with
its original workspace-relative path, item kind, display name, deletion time, and known revision
object identities. `.rumi/trash/` remains hidden from the normal workspace tree.

Restore recreates missing parent directories and prefers the original path. If that path is already
occupied, restore chooses the next collision-safe parenthesized suffix (`Name (1)`, `Name (2)`, and
so on) and never overwrites current content.
Folder and database companion filenames follow a collision-renamed directory.

## Why

Rumi is Linux-first and self-hostable. A desktop recycle-bin API is not reliably available on a
headless server, and filesystem deletion would otherwise make a mistaken sidebar action
irreversible. A workspace-local store has the same behavior across Linux, macOS, containers, and
future deployment adapters, and it travels with the workspace when `.rumi/` is preserved.

## Boundaries

- Trash is a recovery layer for whole current payloads; revision history remains the content
  timeline for Markdown checkpoints.
- Restoring a trashed item reattaches captured object identities and refreshes the search index.
- The runtime owns moves, metadata, collision handling, and restore events. HTTP and web layers do
  not manipulate `.rumi/trash/` directly.
- The workspace root and `.rumi` internals can never be trashed through a content command.
- Permanent deletion is available only for an item already in Trash and removes that entry's
  current payload and metadata. Automatic retention policies remain a separate future feature.

## Public Surface

- `deleteNode` now means move to Trash.
- `listTrash` returns user-facing metadata only.
- `openTrashPage` returns page content through a safe read-only boundary without exposing payload paths.
- `restoreTrashItem` restores one entry and reports its actual path.
- `deleteTrashItem` permanently removes one entry and publishes `trash.changed`.
- `GET /api/trash`, `GET /api/trash/:id`, `POST /api/trash/restore`, and
  `DELETE /api/trash/:id` adapt those commands.
- The sidebar keeps Trash at the bottom. Trash uses a borderless whitespace list with Restore and
  Delete actions. Viewable items open in the normal page canvas with editing disabled, muted
  content, and a persistent Restore/Delete banner.
- Moving to Trash is immediate because it is reversible. Delete requires confirmation that the
  operation is permanent and irreversible.

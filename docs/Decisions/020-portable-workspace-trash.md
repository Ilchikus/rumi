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
updated: "2026-07-20"
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
- Removing items permanently from Trash and retention policies are separate future features.

## Public Surface

- `deleteNode` now means move to Trash.
- `listTrash` returns user-facing metadata only.
- `restoreTrashItem` restores one entry and reports its actual path.
- `GET /api/trash` and `POST /api/trash/restore` adapt those commands.
- The sidebar keeps Trash at the bottom and the Trash view exposes restore actions.

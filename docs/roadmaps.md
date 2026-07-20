# Roadmap

The rebuild should start with the runtime, not with a full UI port.

## First Validation Slice

Build this before anything fancy:

1. `rumi serve ./workspace`
2. Server creates or opens a workspace runtime.
3. Browser opens local UI.
4. File tree loads from server.
5. Open one Markdown page.
6. Edit page.
7. Save through server command with `baseVersion`.
8. Server writes file and updates SQLite index.
9. External file edit is detected and reconciled.
10. Browser receives normalized event and refreshes active view.
11. CLI can run `rumi status` and `rumi index`.

No Git. No GitHub. No hosted auth. No true multiplayer. No asset sync.

## Build Order

1. Workspace format and shared Markdown package.
2. Runtime foundation with temp-dir tests.
3. File tree, open page, save page commands.
4. Version/hash conflict handling.
5. HTTP API adapter and event stream.
6. CLI launcher and maintenance commands.
7. Minimal web shell and file tree.
8. ProseMirror editor open/save integration.
9. Watcher/reconciler.
10. SQLite index.
11. Folder-backed database commands.
12. Database UI.
13. Assets and search.
14. Packaging and deployment polish.

## Milestones

The milestone database is the source of structured planning:

- [M01 Runtime Foundation](Milestones/M01-runtime-foundation.md)
- [M02 API And CLI](Milestones/M02-api-and-cli.md)
- [M03 Web Shell And Tree](Milestones/M03-web-shell-and-tree.md)
- [M04 Editor Integration](Milestones/M04-editor-integration.md)
- [M05 Watcher Index Reconciliation](Milestones/M05-watcher-index-reconciliation.md)
- [M06 Databases](Milestones/M06-databases.md)
- [M07 Assets Search Polish](Milestones/M07-assets-search-polish.md)

## Later

Later, after the basic runtime is boring:

- Smart query views.
- Docker image.
- Homebrew/Linuxbrew packaging.
- `systemd` and `launchd` services.
- Local gateway for `rumi.localhost` without a port.
- Hosted auth and multi-tenant control plane.
- Presence and true multiplayer.
- Optional Git integration as export/sync, not as the runtime foundation.

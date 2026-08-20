---
status: doing
order: 7
areas:
  - assets
  - search
  - web
  - editor
depends_on:
  - M05
  - M06
created: "2026-06-22"
updated: "2026-08-04"
---
# M07 Assets Search Polish

## Goal

Add the next layer of workspace quality after core runtime, editor, and database flows are stable.

## Scope

- Local asset store commands.
- Asset reference indexing.
- Search over title/path/frontmatter/body.
- Basic search ranking.
- Official Rumi block editor preset.
- UI polish around common workflows.
- Portable safe delete and restore for all workspace item types.
- Optimistic open-page rename with background link, mention, and search-index repair.
- URL-safe workspace navigation with deep links and browser Back/Forward support.
- Stable cached workspace startup with a browser-local Home/last-visited preference.

## Exit Criteria

- Assets are stored predictably.
- Search is server-side.
- Search ranking handles exact title and title-prefix matches well.
- Deleted content remains recoverable on headless Linux servers.

## Progress

Server-side indexed search, exact/prefix ranking, result filtering, the search dialog, code-split web
loading, and the first official block-editor preset are implemented. Asset upload/storage commands,
workspace-local Trash and restore are implemented. Rich bookmark/file/database embeds and
open-page inline rename with revision-safe background reference repair, and URL-synchronized
workspace navigation are implemented. The application shell now uses the root-folder identity and
a centered breadcrumb/search address bar with current-item actions. Workspace-owned editor and
upload settings are exposed through an editor-like `/settings` system page and typed runtime/API
commands. `/settings` and `/trash` reserve their application views while equally named workspace
content receives deterministic route suffixes. Automated browser smoke coverage remains open.
Workspace startup and per-history-entry scroll restoration are implemented and in release
verification under M07-015.
The `0.1.17` candidate adds M07-027's system-default Light/Dark theme with workspace-scoped browser
preferences and theme-aware shell, editor, database, overlay, syntax, Mermaid, and notification
surfaces.

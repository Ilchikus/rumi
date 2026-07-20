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
updated: "2026-07-20"
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
a centered breadcrumb/search address bar with current-item actions. Automated browser smoke
coverage remains open.

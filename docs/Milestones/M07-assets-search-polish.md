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
updated: "2026-08-30"
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
The `0.1.17` candidate includes M07-027's system-default Light/Dark theme with workspace-scoped
browser preferences and theme-aware shell, editor, database, overlay, syntax, Mermaid, and
notification surfaces.

## `0.1.17` Candidate Scope

The next release work is split into separately owned, release-tagged tasks:

- [M07-032 Search Tabs And Recents](../Tasks/M07-032-search-tabs-and-recents.md)
- [M07-033 Task Marker Content Preservation](../Tasks/M07-033-task-marker-content-preservation.md)
- [M07-034 Uploads Library](../Tasks/M07-034-media-library.md)
- [M07-035 Multi-Selection Tab Indentation](../Tasks/M07-035-multi-selection-tab-indentation.md)
- [M07-036 Shared Breadcrumb Context Actions](../Tasks/M07-036-shared-breadcrumb-context-actions.md)
- [M07-037 Modifier-Hover Link Affordance](../Tasks/M07-037-modifier-hover-link-affordance.md)
- [M07-038 Pinned Workspace Items](../Tasks/M07-038-pinned-workspace-items.md)

All seven tasks are implemented and have passed their focused automated coverage. M07-033 and
M07-035 remain separate editor transactions; M07-032 and M07-036 are independently testable
web-shell slices; M07-034 owns the runtime inventory, API contract, and `/uploads` client surface.
M07-037 keeps link activation styling scoped to modifier-hover without changing link navigation.
M07-038 adds browser-local Pinned items, direct sidebar Pin/Unpin controls, and one shared menu
across the header, sidebar, and breadcrumbs. The integrated `0.1.17` gate passes with 86 test files
and 743 tests, repository typecheck, both production builds, the installable server-package smoke,
and task-specific production browser QA. All seven release tasks are done and the candidate is
ready for pull-request merge and publication.

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
updated: "2026-07-18"
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

## Exit Criteria

- Assets are stored predictably.
- Search is server-side.
- Search ranking handles exact title and title-prefix matches well.

## Progress

Server-side indexed search, exact/prefix ranking, result filtering, the search dialog, code-split web
loading, and the first official block-editor preset are implemented. Asset upload/storage commands,
rich bookmark/file/database embeds, and automated browser smoke coverage remain open.

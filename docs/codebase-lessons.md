# Codebase Lessons

These lessons come from the existing Electron implementation and should guide the fresh rebuild.

## Current Strengths To Keep

- Plain Markdown files as user-owned content.
- YAML frontmatter for properties.
- Folder pages via `{folder}.index.md`.
- Databases as folders via `{database}.db.md`.
- Database records as Markdown files.
- Database description/body can be rich content, unlike Notion's limited database description.
- Per-item block interactions for lists, backed by standard nested Markdown list structure.
- ProseMirror as a strong editor foundation.

## Current Pressure Points

The renderer currently coordinates too much:

- File writes.
- SQLite updates.
- Git save hooks.
- Store updates.
- Refreshes.
- Database mutations.
- Rename/delete side effects.

The new server should centralize these as domain commands.

## What Not To Recreate

Do not recreate:

- `window.api` as a one-to-one HTTP API.
- UI components that call raw file operations and then manually update indexes.
- Git/revision flow as a prerequisite for server work.
- Path strings as the only memory of open state without repair mechanisms.
- Markdown serialization on every editor transaction.
- Database domain logic inside React table components.

## Root Cause Pattern

Many existing bugs come from one problem:

```text
The app exposes low-level operations, then asks UI components to coordinate product behavior.
```

The rebuild should invert this:

```text
The runtime exposes product behavior, and UI components express intent.
```

## Good Existing Ideas

Keep:

- File over app.
- Folder-backed databases.
- Rich database page body.
- Sidebar/file-tree mental model.
- Search across pages/folders/databases.
- Assets stored near the workspace.
- Rumi-specific files only where they represent real Rumi objects, like `.db.md` and `.index.md`.

## Database View Investigation

The M06 foundation already parses an array of table views from `.db.md`, supports flat
`filters`/`filterMode` and `sorts`, and evaluates request filters in the runtime. The next database
view slice should extend this path rather than add a second query system.

Current gaps to account for:

- `DatabaseView` always reads `schema.views[0]`; view type and name do not currently select a view.
- The table appends every schema property missing from `view.columns`, so the current UI cannot
  represent a deliberately hidden column even though the YAML has a column list.
- The table sends only local title-search and sort state to `queryDatabase`; saved view filters and
  sorts are not applied by the client.
- Full-page and embedded databases already reuse `DatabaseView`, which is the right seam for shared
  tabs, filters, and visibility controls.
- The embed schema roundtrips `view`, `filter`, and `sort` fields, but only `source` currently
  affects rendering. The `view` field can become the embed's stable selected-view reference; filter
  and sort configuration should remain canonical in `.db.md`.
- Property creation is implemented twice: an inline table form and a separate record/page row with
  a native type selector. A shared anchored menu avoids divergent keyboard and validation behavior.
- Property rename/delete and select-option mutations currently rewrite only flat filters. Nested
  groups require recursive reference repair in the runtime.

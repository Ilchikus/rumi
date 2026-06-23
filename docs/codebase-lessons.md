# Codebase Lessons

These lessons come from the existing Electron implementation and should guide the fresh rebuild.

## Current Strengths To Keep

- Plain Markdown files as user-owned content.
- YAML frontmatter for properties.
- Folder pages via `{folder}.index.md`.
- Databases as folders via `{database}.db.md`.
- Database records as Markdown files.
- Database description/body can be rich content, unlike Notion's limited database description.
- Flat block model for editor list items.
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

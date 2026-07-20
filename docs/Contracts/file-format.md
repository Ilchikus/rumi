---
status: draft
area: file-format
owner: shared
created: "2026-06-22"
updated: "2026-07-18"
---
# File Format

Canonical user content is Markdown with one normal YAML frontmatter block.

Avoid:

- Two frontmatter blocks.
- Required `rumi_id` in normal pages.
- ID-based filenames.
- App-internal metadata clutter in every file.

Accepted Rumi-specific files:

```text
<workspace-root-name>.index.md
Folder/Folder.index.md
Database/Database.db.md
.assets/
.rumi/
```

`.db.md` and `.index.md` are canonical Rumi workspace objects, not cache files.
The root-level `<workspace-root-name>.index.md` is the workspace homepage: it is represented by the
workspace root node, hidden as a separate sidebar child, and opens at `/`.
For compatibility with existing Markdown folders, a plain root-level `index.md` is also recognized
as the homepage when the workspace-named companion is absent.

SQLite index data is rebuildable.

Rumi-owned operational history is stored under `.rumi/objects/` and `.rumi/revisions/`. It is not
Git history and does not add required IDs to canonical Markdown files. Revision blobs are exact,
content-addressed Markdown snapshots.

Future database relation definitions are not part of the accepted file contract yet. Proposed
Decision 019 recommends typed schema definitions whose record values reuse quoted internal-link
strings rather than opaque IDs or nested path objects.

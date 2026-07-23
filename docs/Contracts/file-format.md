---
status: draft
area: file-format
owner: shared
created: "2026-06-22"
updated: "2026-07-23"
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
Database `.db.md` frontmatter stores property definitions, shared view definitions, nested saved
filters, per-view visible columns, and database-record page presentation settings. Stable view IDs
are limited to this database configuration object; they do not add IDs to ordinary pages or
database records. The detailed shape and compatibility rules live in the
[database views contract](database-views.md).
The root-level `<workspace-root-name>.index.md` is the workspace homepage: it is represented by the
workspace root node, hidden as a separate sidebar child, and opens at `/`.
For compatibility with existing Markdown folders, a plain root-level `index.md` is also recognized
as the homepage when the workspace-named companion is absent.

Workspace upload policy lives at `.rumi/config.json`. Rumi reads it when the workspace opens and
refuses to start when the policy is malformed or attempts to enable an unsupported file type. For
example:

```json
{
  "uploads": {
    "maxFileSizeMb": 10,
    "allowedFileTypes": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"]
  }
}
```

The upload limit may be from 1 through 50 MB. Supported extensions are `.avif`, `.bmp`, `.gif`,
`.ico`, `.jpeg`, `.jpg`, `.pdf`, `.png`, and `.webp`; a workspace can enable any subset, including
an empty list to disable uploads. Rumi verifies uploaded bytes against the declared file type in
addition to checking the filename extension. Existing workspace assets remain readable when a type
is removed from the upload allowlist. Other top-level configuration domains can coexist in the same
file, while unknown settings inside `uploads` are rejected to catch mistakes. Restart the workspace
server after changing this configuration.

SQLite index data is rebuildable.

Rumi-owned operational history is stored under `.rumi/objects/` and `.rumi/revisions/`. It is not
Git history and does not add required IDs to canonical Markdown files. Revision blobs are exact,
content-addressed Markdown snapshots.

Future database relation definitions are not part of the accepted file contract yet. Proposed
Decision 019 recommends typed schema definitions whose record values reuse quoted internal-link
strings rather than opaque IDs or nested path objects.

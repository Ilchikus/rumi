---
status: draft
area: file-format
owner: shared
created: "2026-06-22"
updated: "2026-06-22"
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
Folder/Folder.index.md
Database/Database.db.md
.assets/
.rumi/
```

`.db.md` and `.index.md` are canonical Rumi workspace objects, not cache files.

SQLite index data is rebuildable.

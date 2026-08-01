---
status: draft
area: file-format
owner: shared
created: "2026-06-22"
updated: "2026-08-01"
---
# File Format

Canonical user content is Markdown with one normal YAML frontmatter block.

Within prose, a single LF is a soft line break in the same paragraph and a blank line is the
paragraph/block boundary. The official editor displays soft line breaks visibly, matching Obsidian's
non-strict line-break mode. Explicit Markdown hard breaks remain distinct and readable; Rumi does not
require trailing spaces for ordinary multiline prose.

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
    "maxFileSizeMb": 50,
    "allowedFileTypes": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".mp4", ".webm"]
  },
  "editor": {
    "highlightMisspellings": false,
    "inlineReplacements": true,
    "emojiSuggestions": true
  }
}
```

The upload limit defaults to 50 MB when omitted. A positive whole number sets a per-file limit,
zero disables uploads, and `null` represents the blank setting and removes Rumi's per-file limit.
Supported extensions are `.avif`, `.bmp`, `.gif`, `.ico`, `.jpeg`, `.jpg`, `.mp4`, `.pdf`, `.png`,
`.webp`, and `.webm`; a workspace can enable any subset, including an empty list to disable uploads.
MP4 and WebM currently receive generic asset upload/read support rather than dedicated editor
playback. Rumi verifies uploaded bytes against the declared file type in addition to checking the
filename extension. Existing workspace assets remain readable when a type is removed from the
upload allowlist. Other top-level configuration domains can coexist in the same file, while unknown
settings inside `uploads` are rejected to catch mistakes. Restart the workspace server after
changing this configuration by hand. The runtime settings command atomically preserves other
top-level domains and applies upload-policy changes immediately.

`editor.highlightMisspellings` controls the browser's native spellcheck underlines in the official
editor. It defaults to `false`; setting it to `true` enables the browser's spelling suggestions for
every page in the workspace.

`editor.inlineReplacements` controls direct-typing replacements such as `->` to `→`, and
`editor.emojiSuggestions` controls the caret-anchored selector opened by a valid `:` prose trigger.
Both default to `true`. Replacement symbols and selected emoji are stored as literal UTF-8 Markdown
text; opening, pasting, or externally reconciling content does not invoke either typing feature.
Unknown editor settings and non-boolean values are rejected.

SQLite index data is rebuildable.

Rumi-owned operational history is stored under `.rumi/objects/` and `.rumi/revisions/`. It is not
Git history and does not add required IDs to canonical Markdown files. Revision blobs are exact,
content-addressed Markdown snapshots.

Future database relation definitions are not part of the accepted file contract yet. Proposed
Decision 019 recommends typed schema definitions whose record values reuse quoted internal-link
strings rather than opaque IDs or nested path objects.

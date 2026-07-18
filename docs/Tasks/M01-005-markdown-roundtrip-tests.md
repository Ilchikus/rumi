---
status: done
type: test
milestone: M01
owner_layer: markdown
coverage:
  - markdown
created: "2026-06-22"
updated: "2026-07-18"
---
# M01-005 Markdown Roundtrip Tests

## Goal

Protect Markdown as the durable data format.

## Scope

- Build roundtrip fixtures for important block and mark types.
- Assert parse/serialize stability or documented normalization.
- Keep tests independent from browser UI.

## Required Coverage

- [x] Frontmatter/no-frontmatter baseline.
- [x] Paragraphs/headings.
- [x] Lists and indentation.
- [x] Task items.
- [x] Blockquotes.
- [x] Tables.
- [x] Code blocks and Mermaid.
- [x] Images/assets.
- [x] Links/internal refs.
- [x] Highlights/underline/strikethrough/custom syntax.
- [x] Empty docs and blank lines.

## Done When

- Future editor work has a safety net before UI integration begins.

## Progress

Frontmatter parsing/serialization and the ProseMirror Markdown bridge now protect the listed block
and mark types. Unsafe executable link targets are also rejected during parse.

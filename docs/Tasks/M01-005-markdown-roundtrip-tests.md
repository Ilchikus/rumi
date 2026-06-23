---
status: ready
type: test
milestone: M01
owner_layer: markdown
coverage:
  - markdown
created: "2026-06-22"
updated: "2026-06-22"
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
- [ ] Paragraphs/headings.
- [ ] Lists and indentation.
- [ ] Task items.
- [ ] Blockquotes.
- [ ] Tables.
- [ ] Code blocks and Mermaid.
- [ ] Images/assets.
- [ ] Links/internal refs.
- [ ] Highlights/underline/strikethrough/custom syntax.
- [ ] Empty docs and blank lines.

## Done When

- Future editor work has a safety net before UI integration begins.

## Progress

Initial frontmatter parsing/serialization tests exist. Full block roundtrip coverage still needs to be added before editor migration.

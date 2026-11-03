---
status: accepted
areas:
  - editor
  - web
  - files
impact: medium
created: 2026-11-03
updated: 2026-11-03
---
# Derive The Document Outline In The Frontend

## Decision

The table of contents is an accessible live navigation panel derived from the current ProseMirror
headings. It never inserts or maintains a TOC block in Markdown. It includes unsaved heading edits.

Heading fragments use lowercase Unicode heading text, punctuation removal, whitespace converted to
hyphens, and numeric suffixes for duplicates and collisions. Empty headings use `section`.
Heading IDs are derived DOM attributes, never required IDs in files. Heading renames naturally change
their anchor; cross-file repair of heading renames is outside this release.

Opening a fragment reveals the heading's collapsed ancestors and scrolls it into view without
changing document content. Same-page links, cross-page links, new-tab URLs and cold deep links use
the same fragment format.

Markdown table widths are also presentation state. The existing ProseMirror resizing attributes
retain the actual widths, and browser-local storage scopes them by workspace, page, table header
text and occurrence. This does not add source metadata or a runtime API. Widths follow ordinary
in-page text editing; changing table identity externally can forget this personal layout.

## Why

Navigation should stay current without creating source churn. Content remains portable, while the
browser owns personal layout, as it already does for heading collapse and database table widths.

A future explicit export action may generate a portable Markdown TOC if users need it.

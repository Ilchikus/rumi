---
status: done
type: feature
milestone: M07
release: "0.1.20"
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
created: 2026-11-03
updated: 2026-11-03
---
# M07-061 Live frontend table of contents

## Goal

Live frontend table of contents.

## Scope

Provide an accessible live outline derived from headings with duplicate-safe Unicode anchors; navigation reveals collapsed ancestors and never changes Markdown.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Outline and anchor tests, live editor update and navigation smoke tests.

## Implementation Notes

Part of the 0.1.20 desktop editor release.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

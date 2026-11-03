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
# M07-057 Add two-column content blocks

## Goal

Add two-column content blocks.

## Scope

Use an explicit fenced columns container with a standalone separator for two independently editable block columns; avoid interpreting ordinary inline pipes.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Markdown roundtrip, paste/copy and editor creation/navigation tests; browser QA.

## Implementation Notes

The shared columns parser is used by both the editor and reference repair. Runtime repair coverage
proves that live column links and assets follow renames while nested code examples stay unchanged.
Nested headings keep collapse state and section boundaries inside their own column.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

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
# M07-053 Avoid unnecessary Markdown escapes

## Goal

Avoid unnecessary Markdown escapes.

## Scope

Keep harmless underscore and tilde prose readable, retain literal syntax where ambiguous, and ensure repeated parse/save is stable.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Markdown roundtrip tests for punctuation, literal syntax and repeated saves.

## Implementation Notes

Harmless punctuation stays readable. Potential delimiter pairs are checked against the complete
inline content, including mark boundaries, so removing escapes cannot introduce formatting across
bold text or links. Simple prose takes a cheap path and validated sequences use a bounded cache.
The supplied private page returned HTTP 401; original-source confirmation is tracked separately.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

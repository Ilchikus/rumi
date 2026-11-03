---
status: done
type: feature
milestone: M07
release: "0.1.20"
owner_layer: web
coverage:
  - markdown
  - ui-smoke
created: 2026-11-03
updated: 2026-11-03
---
# M07-062 Preview internal pages on hover

## Goal

Preview internal pages on hover.

## Scope

Delayed internal-link preview shows title, properties and a plain content excerpt through existing page API, ignores external links and discards stale requests.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

web

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Preview resolution, async lifecycle, properties and excerpt interaction tests.

## Implementation Notes

Part of the 0.1.20 desktop editor release.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

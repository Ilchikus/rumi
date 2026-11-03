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
# M07-052 Keep workspace image destinations readable

## Goal

Keep workspace image destinations readable.

## Scope

Investigate reported cars image failures and cover identified image parsing/resolution failures without rewriting unrelated content.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Markdown roundtrip and asset URL tests; real-page inspection when accessible.

## Implementation Notes

Fixed paragraph parsing that dropped adjacent/mixed images, retained linked-image destinations,
and resolved page-relative asset paths while preserving root `.assets/` uploads. Regression tests
cover repeated save/reopen and browser QA covers gallery loading. The supplied live page returned
HTTP 401, so the specific private source could not be inspected; post-release confirmation is still
needed for that report.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

---
status: doing
type: feature
milestone: M02
owner_layer: api
coverage:
  - api
  - runtime
created: "2026-06-22"
updated: "2026-06-23"
---
# M02-001 HTTP API Adapter

## Goal

Expose core runtime commands through HTTP without leaking low-level file operations.

## Scope

- Open workspace/session shape.
- Get tree.
- Open page.
- Save page.
- Standard error/conflict response.
- Event stream placeholder.

## Required Coverage

- [x] API test for get tree.
- [x] API test for open page.
- [x] API test for save page conflict.
- [x] Runtime tests remain the deeper behavior tests.

## Done When

- Web client can use API for the first page read/save flow.

## Progress

Initial HTTP routes exist for workspace info, tree, open page, and save page. Event stream implementation is tracked in [M02-004 Page Changed Events](M02-004-page-changed-events.md).

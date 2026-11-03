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
# M07-063 Navigate to page heading anchors

## Goal

Navigate to page heading anchors.

## Scope

Open same-page and cross-page heading fragments including deep links, preserve anchor in new-tab URLs, support duplicate and Unicode headings.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

web

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Link resolution and heading navigation tests; browser deep-link QA.

## Implementation Notes

Anchor fragments survive same-page/cross-page navigation, new tabs, cold links and browser history.
A homepage fragment takes priority over last-visited startup hydration. Fragment navigation takes
priority over cached scroll restoration and reveals collapsed ancestors.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.

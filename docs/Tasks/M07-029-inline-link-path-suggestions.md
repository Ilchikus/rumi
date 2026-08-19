---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-18"
updated: "2026-08-18"
---
# M07-029 Inline Link Path Suggestions

## Goal

Make workspace links fast to enter without adding another dropdown to the link editor.

## Scope

- Search the current workspace document index as the URL/path input changes.
- Render the active match as inline ghost text within the existing input.
- Preserve directory context and rank root path prefixes before filename-only matches.
- Cycle candidates with ArrowDown or ArrowRight and accept the visible value with Tab.

## Required Coverage

- [x] Ranking coverage for absolute path prefixes, filename matches, and relative output.
- [x] DOM coverage for inline rendering, both navigation keys, Tab acceptance, and retained focus.
- [x] Editor interaction contract update.
- [x] Full release checks.
- [ ] Real-browser visual and keyboard smoke.

## Done When

Typing `/docs/todo` suggests the matching page under `/docs` first, the suggestion remains inside the
input, either supported arrow advances it, and Tab replaces the query with the visible destination.

## Verification

- The focused selection-toolbar suite passes ranking and keyboard interaction coverage.
- The full `0.1.16` release checks pass.

---
status: done
type: feature
milestone: M07
release: "0.1.17"
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
  - docs
created: "2026-08-22"
updated: "2026-08-31"
---
# M07-035 Multi-Selection Tab Indentation

## Goal

Apply Tab and Shift-Tab to every selected flat list item when a text range or explicit block
selection spans multiple items.

## Scope

- Resolve eligible bullet, numbered, and task items touched by a non-empty text selection across
  multiple blocks.
- Resolve every eligible item in an explicit block selection, including non-contiguous selections
  made with the block handles.
- Tab increases each eligible item's current indent by one, capped independently at the existing
  maximum. Shift-Tab decreases each by one, floored independently at zero.
- Apply all changed items in one ProseMirror transaction so one Undo restores the complete group.
- Preserve each item's type, task checked state, inline content/marks, order, and relative indent
  differences except where an individual item reaches a boundary.
- Preserve and map the active text selection. Keep an explicit block selection highlighted with
  the same selected items after indentation and avoid an unnecessary scroll jump.
- Leave single-item Tab/Shift-Tab, code-block Tab insertion, and table-cell navigation behavior at
  their established priority.
- In a mixed selection, change eligible flat list items and leave other selected blocks untouched.
  If no eligible item can change, return control to the existing fallback instead of trapping Tab.

## Out Of Scope

- Adding indentation attributes or new Markdown syntax to paragraphs, headings, quotes, code,
  tables, or other non-list blocks.
- Treating visual wraps or soft breaks inside one paragraph as separately indentable blocks.
- General parent/child block grouping, which remains a separate file-format research topic.
- Changing the four-level maximum or list serialization grammar.

## Owner Layer

editor

## Required Coverage

- [x] Editor transaction tests for forward and reverse indentation across a contiguous text range.
- [x] Explicit block-selection tests for contiguous and non-contiguous bullet, numbered, and task
      items.
- [x] Mixed-selection and independent max/min boundary tests.
- [x] Selection-mapping tests for text and block selections, including one-step Undo/Redo.
- [x] Regression tests for single-item indentation, code Tab insertion, table navigation, and an
      ineligible selection that must not trap focus.
- [x] Markdown serialization/roundtrip assertions for all list types and preserved relative indent.
- [x] Browser smoke test for text-highlight and block-handle selection flows.
- [x] Editor-interaction contract update.

## Implementation Notes

Build one shared command that first snapshots the target block positions, then applies mapped
`setNodeMarkup` operations from document order. The explicit multi-block plugin requires its
selection metadata to survive the document-changing transaction; text selections should be mapped
through the transaction rather than recreated from stale offsets.

This task extends the existing flat-list indentation contract only. It must not pre-empt the open
design work for generic block indentation/grouping.

## Dependencies

- `M07-013-inline-toolbar-and-bulk-formatting.md`
- `M07-017-editor-selection-and-clipboard-polish.md`

## Verification

- The focused keyboard/block suite passes with 48 tests across forward/reverse text selections,
  contiguous and non-contiguous explicit selections, mixed blocks, boundaries, selection mapping,
  undo/redo, Markdown, and the existing code/table/single-item fallbacks.
- The integrated `0.1.17` gate passes with 86 test files and 743 tests, repository typecheck, both
  production builds, and the installable server-package smoke.
- Production browser QA confirms text-range and explicit multi-block selections indent and outdent
  every eligible list item while retaining the active selection and leaving mixed blocks unchanged.

## Done When

- Tab or Shift-Tab changes every eligible selected list item exactly once for both text and block
  selections.
- The operation is one undoable editor change and preserves selection, content, marks, task state,
  ordering, and Markdown durability.
- Existing code, table, single-item, and native focus behavior remain intact.
- Focused tests, the full release checks, and manual browser QA pass.

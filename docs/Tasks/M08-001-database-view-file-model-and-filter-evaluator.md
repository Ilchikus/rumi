---
status: done
type: feature
milestone: M08
owner_layer: database
coverage:
  - runtime
  - markdown
created: 2026-07-23
updated: 2026-07-23
---
# M08-001 Database View File Model And Filter Evaluator

## Goal

Extend the canonical database model with stable views, nested filter groups, exact columns, and
independent record-page property visibility.

## Scope

- Add stable database-local view IDs and preserve multiple views of the same type.
- Treat table `columns` as the exact ordered visible-property list.
- Parse, serialize, validate, and evaluate recursive filter groups.
- Parse and serialize `recordPage.hiddenProperties`.
- Preserve unknown future property/view definitions and unrelated `.db.md` frontmatter.
- Recursively repair filter, sort, column, and record-page references during property/option
  rename and delete.
- Keep legacy flat filters valid and assign missing view IDs on the next successful config mutation.

## Out Of Scope

- HTTP routes.
- React UI.
- Non-table view rendering.

## Owner Layer

database

## Required Coverage

- [x] Runtime roundtrip test covers multiple same-type views, IDs, exact columns, and record-page
  hidden properties.
- [x] Runtime tests cover nested `and`/`or` evaluation and the property-type operator matrix.
- [x] Runtime tests cover numeric/date comparisons, searchable-option value validation semantics,
  and multi-select membership/set equality.
- [x] Runtime tests cover recursive repair after property and option rename/delete.
- [x] Preservation test covers unsupported future property and view definitions.

## Implementation Notes

Keep the existing root `filters` plus `filterMode` shape for backward compatibility. A nested group
uses the same two fields as an item in `filters`.

## Done When

- The runtime can roundtrip and correctly evaluate the canonical example in the database-view
  contract without client help or data loss.

## Verification

- Runtime database suite and full repository test suite pass.
- Canonical `.db.md` output was inspected after browser-driven view, filter, property, and
  visibility mutations.

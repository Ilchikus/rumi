---
status: done
type: feature
milestone: M08
owner_layer: web
coverage:
  - ui-smoke
created: 2026-07-23
updated: 2026-07-23
---
# M08-004 Nested Database Filter Builder

## Goal

Let users build and persist type-aware nested filters from the database toolbar.

## Scope

- Add the filter icon immediately beside `New`.
- Build an anchored filter menu from local shadcn/Radix-style primitives.
- Support rules and recursively nested groups with independent `and`/`or` modes.
- Restrict conditions and value controls by property type.
- Use searchable schema-option pickers for select and multi-select values.
- Keep all edits local until `Apply`, then persist the complete valid tree to the active view.
- Refresh both full and embedded instances through normalized events without global action
  notifications.

## Out Of Scope

- Formula filters.
- Relation/rollup filters.
- A separate advanced query language.

## Owner Layer

web

## Required Coverage

- [x] Component tests cover the operator matrix, property-change reset, nested group editing, and
  the draft/Apply persistence boundary.
- [x] Component test covers searchable select and multi-select option values.
- [x] UI smoke test creates `(A and (B or C))`, reloads, and sees the same filtered records on full
  and embedded views.

## Implementation Notes

The menu edits configuration; it does not evaluate records. Query results always come from the
runtime using the saved active view.

## Done When

- A user can create, reload, edit, and delete grouped filters without leaving stale YAML or seeing
  different results between database surfaces.

## Verification

- Filter helper/runtime tests and the full repository suite pass.
- Browser smoke confirmed that editing a rule sends no update request, Apply sends exactly one
  successful view update and closes the menu, and the resulting filter badge/query refresh without
  a global notification.

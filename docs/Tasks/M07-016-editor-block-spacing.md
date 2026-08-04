---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-04"
updated: "2026-08-04"
---
# M07-016 Editor Block Spacing

## Goal

Give paragraphs the former list-row breathing room while making list rows slightly more compact.

## Scope

- Set top-level paragraph vertical spacing to 4 pixels on both sides.
- Set flat bullet, numbered, and task row vertical spacing to 2 pixels on both sides.
- Protect the active editor CSS values with a focused layout contract.

## Out Of Scope

- Changing line height or spacing inside a multiline block.
- Changing heading, quote, table, code, embed, or nested semantic-list spacing.
- Changing Markdown parsing or serialization.

## Owner Layer

editor

## Required Coverage

- [x] UI smoke test for paragraph and flat-list spacing values.
- [x] Editor interaction contract update.

## Implementation Notes

The active migrated editor uses flat top-level list nodes. This change updates only their visual
block margins and top-level paragraph margins; document structure and Markdown remain unchanged.

## Done When

- Every top-level paragraph has 4 pixels of vertical margin on both sides.
- Every flat bullet, numbered, and task row has 2 pixels of vertical margin on both sides.
- Focused editor layout coverage and the relevant repository checks pass.

## Verification

Verified on 2026-08-04:

- focused editor layout coverage passed with 14 tests
- `corepack pnpm check` passed with 65 test files and 486 tests, typecheck, the production web
  build, and the bundled server build
- `corepack pnpm check:server-package` verified the installable `@rumi-md/server@0.1.14`
- a disposable Chrome profile against the no-auth sandbox reported computed paragraph margins of
  4 pixels and flat-list margins of 2 pixels on both top and bottom

User visual QA remains open. The pull request must remain unmerged until explicit approval after
testing.

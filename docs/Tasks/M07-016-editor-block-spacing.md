---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-04"
updated: "2026-08-05"
---
# M07-016 Editor Block Spacing

## Goal

Give paragraphs the former list-row breathing room while making list rows slightly more compact.

## Scope

- Set top-level paragraph vertical spacing to 5 pixels on both sides.
- Set flat bullet, numbered, and task row vertical spacing to 2 pixels on both sides.
- Remove the extra left inset from paragraphs and top-level list markers while retaining the list
  marker gutter between a marker and its text.
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

The active migrated editor uses flat top-level list nodes. This change updates their visual block
margins and horizontal alignment only; document structure and Markdown remain unchanged.

## Done When

- Every top-level paragraph has 5 pixels of vertical margin on both sides and no left padding.
- Every flat bullet, numbered, and task row has 2 pixels of vertical margin on both sides.
- Paragraph text and top-level list markers start at the editor content edge.
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

Spacing follow-up on 2026-08-05:

- increased top-level paragraph margins to 5 pixels on both sides
- removed the paragraph left inset and aligned the top-level bullet marker with the numbered and
  task markers at the editor content edge
- focused editor layout coverage passed with 14 tests; `corepack pnpm check` passed with 65 test
  files and 486 tests, typecheck, the production web build, and the bundled server build
- disposable-browser computed styles confirmed zero paragraph left padding, 5-pixel paragraph
  margins, 2-pixel list margins, and equal paragraph/list-block left edges; the numbered marker
  starts at the list block edge while its marker-to-text gutter remains intact
- user visual QA remains open; no merge is allowed before explicit approval

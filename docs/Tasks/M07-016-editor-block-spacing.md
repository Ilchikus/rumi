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
- Give bullets, ordered markers, and checkboxes the same 8-pixel decoration-to-text gap and muted
  presentation. Keep ordered markers left-aligned with tabular numerals and offset checkboxes 2
  pixels downward for optical alignment.
- Draw one subtle vertical guide per flat-list indentation level.
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

The active migrated editor uses flat top-level list nodes. Bullet and numbered DOM output now wraps
the decoration and editable content separately, matching the existing task-item structure. This
lets every list family share one flex gap without changing its ProseMirror content or Markdown.

## Done When

- Every top-level paragraph has 5 pixels of vertical margin on both sides and no left padding.
- Every flat bullet, numbered, and task row has 2 pixels of vertical margin on both sides.
- Paragraph text and top-level list markers start at the editor content edge.
- Every flat-list decoration has the same 8-pixel visual gap before editable text and uses the muted
  foreground color; checked task boxes use the same muted accent.
- Ordered markers are left-aligned and use tabular numerals; task checkboxes are offset 2 pixels
  downward.
- Nested flat-list rows show the correct count of muted indentation guides.
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
- focused list-layout, Markdown, paste, checklist, and block-handle coverage passed with 5 files and
  105 tests; typecheck passed
- `corepack pnpm check` passed with 65 test files and 487 tests, typecheck, the production web
  build, and the bundled server build
- disposable-browser computed geometry confirmed an 8-pixel decoration-to-text gap and 2-pixel
  top/bottom margins for bullet, numbered, and task rows; checklist inputs sit exactly 2 pixels
  below the row top, ordered markers are left-aligned with tabular numerals, and all three
  decoration families resolve to the muted foreground color
- the same browser pass confirmed a 24-pixel guide region with an active vertical-line background
  for first-level nested checklist rows
- user visual QA remains open; no merge is allowed before explicit approval

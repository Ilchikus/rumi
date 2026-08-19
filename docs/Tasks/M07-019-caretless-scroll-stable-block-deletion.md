---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-14"
updated: "2026-08-17"
---
# M07-019 Caretless Scroll-Stable Block Deletion

## Goal

Delete one or more explicit blocks without moving the viewport or activating a cursor elsewhere in
the document.

## Scope

- Route keyboard, handle-menu, structural-caret, and full-toolbar block deletion through the same
  whole-block transaction.
- Clear explicit block selection after deletion.
- Leave the editor inactive and remove the browser selection so no text, node, or structural caret
  remains visible.
- Do not request ProseMirror selection scrolling after a block deletion.
- Preserve the schema-required empty paragraph when every block is deleted without activating it.

## Out Of Scope

- Ordinary character, range, or inline text deletion.
- Cursor placement after block conversion, duplication, movement, paste, or list editing.
- Undo/redo history behavior beyond retaining the existing block-deletion step.

## Owner Layer

editor

## Required Coverage

- [x] Whole-block transaction tests for inactive selection and no scroll request.
- [x] Entry-point coverage for explicit selection, toolbar, context-menu, and structural deletion.
- [x] Editor interaction contract update.
- [x] Full typecheck, tests, production build, and server-package release check before release.

## Done When

- Deleting one or more selected blocks shows no active caret afterward.
- The editor viewport remains where it was before deletion.
- All block-delete entry points share the behavior.
- Undo can still restore the deleted blocks.

## Verification

Verified on 2026-08-17:

- focused selected-block, handle-menu, top-toolbar, structural-caret, keyboard-block, Mermaid, and
  caretless-boundary coverage passed with 83 tests;
- deletion transactions explicitly remain inactive and do not set ProseMirror's
  `scrolledIntoView` flag, while entry-point tests verify that the editor is not refocused;
- `corepack pnpm check` passed with 73 test files and 604 tests, typecheck, the production web
  build, and the bundled server build;
- `corepack pnpm check:server-package` verified the installable `@rumi-md/server@0.1.16` package.

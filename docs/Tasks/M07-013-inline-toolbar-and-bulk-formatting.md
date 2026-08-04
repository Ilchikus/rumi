---
status: done
type: feature
milestone: M07
owner_layer: editor
coverage:
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-08-03"
updated: "2026-08-04"
---
# M07-013 Inline Toolbar And Bulk Formatting

## Goal

Let a workspace choose how the inline formatting toolbar appears and make inline actions coherent
when the user has explicitly selected several blocks.

## Scope

- Persist `floating`, `top`, and `none` inline-toolbar modes in workspace settings, while reading
  the former `sticky` value as `top`.
- Keep floating behavior anchored above the active text or block highlight.
- Keep Floating compact and render Top as an always-visible, left-aligned formatting bar fixed
  above the viewport's bottom safe-area inset and aligned to the editor content column.
- Hide the toolbar completely in none mode.
- Give Top separate block-placement, undo/redo, block conversion/media, inline-formatting, and
  delete groups divided by vertical borders. The history group sits between placement and block
  conversion, while delete remains the final destructive action. Distribute the groups across the
  full bar width while preserving compact spacing between controls inside each group.
- Use Phosphor icons for placement, history, and delete controls. Top offers the common handle-menu
  block conversions but leaves Mermaid, Table, and Divider in the handle menu; its media picker is
  limited to allowed workspace upload extensions.
- Route Top's delete button through the canonical block deletion transaction, which removes whole
  selected block nodes for every handle, keyboard-menu, or toolbar entry point.
- Keep toolbar buttons and keyboard shortcuts on the same ProseMirror history. Top shows shortcut
  hints for placement, movement, history, and block replacement; Mod-Enter adds after and
  Shift-Mod-Enter adds before, while code retains its established Mod-Enter exit behavior.
- Store Mermaid source as ordinary ProseMirror code content. Give database embeds and dividers
  native-history-compatible before/after structural caret positions so keyboard navigation and
  block deletion do not require an inactive editor or visible whole-node selection.
- Apply toolbar marks and formatting shortcuts to every selected block, including non-contiguous
  selections, without changing blocks between them.
- Normalize mixed inline-mark selections to one shared state.
- Give every selected task item the checked state of a toggled selected task.
- Preserve native ProseMirror Shift-Up/Down and Shift-Mod-Up/Down behavior for inline selections.
  For explicit block selections, Shift-Up/Down adds one adjacent block and Shift-Mod-Up/Down
  extends to the matching document boundary.
- Keep marquee selection anchored to its original document position while scrolling. Auto-scroll
  proportionally when the held pointer enters the top or bottom 100-pixel viewport zone, extending
  the selected block range as new content enters the marquee.

## Out Of Scope

- Per-user toolbar preferences.
- New formatting marks or task-list syntax.
- A toolbar for read-only Trash pages.

## Owner Layer

editor

## Required Coverage

- [x] Runtime configuration default, persistence, and invalid-mode tests.
- [x] API settings roundtrip coverage.
- [x] Editor transactions for contiguous and non-contiguous block formatting.
- [x] Editor interaction coverage for selected task checkbox synchronization.
- [x] UI smoke coverage for settings wiring and all toolbar modes.
- [x] File-format and editor-interaction contract updates.

## Done When

- Saving any toolbar mode updates an open editor without remounting it.
- Floating, Top, and hidden modes match their named behavior.
- Top undo/redo follows editor history, and its final delete action removes the current block or all
  explicitly selected blocks through the canonical whole-block deletion transaction.
- Keyboard undo/redo and Top undo/redo invoke the same ProseMirror commands and history stack.
- Mermaid source accepts a normal text caret; database embeds and dividers expose distinct leading
  and trailing caret positions that survive undo and redo.
- Inline and block Shift-arrow gestures dispatch according to the active selection kind, and held
  marquee selection remains anchored while edge auto-scroll extends it.
- Inline marks, links, keyboard formatting, and task toggles operate across explicit block
  selections as one transaction.
- Focused tests, typecheck, and the production build pass.

## Verification

Verified on 2026-08-04:

- focused runtime, API, settings UI, toolbar, inline-formatting, task-checkbox, structural-caret,
  Mermaid history, and keyboard shortcut tests passed
- `corepack pnpm typecheck` passed
- the full suite passed: 61 test files and 473 tests
- the production web and bundled `@rumi-md/server` builds passed
- release candidate version: `@rumi-md/server@0.1.13`

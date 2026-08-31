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
# M07-033 Task Marker Content Preservation

## Goal

Convert a task marker typed at the start of an existing paragraph without deleting the paragraph's
existing content.

## Scope

- Fix the live task-item input rule so it removes only the recognized marker and trailing trigger
  space instead of replacing the complete source block with an empty task item.
- Preserve all content after the trigger, including inline marks, links, emoji, hard/soft breaks,
  and other valid inline nodes.
- Cover every currently accepted task marker: `[]`, `[x]`, `-[]`, `-[x]`, `- []`, `- [x]`, and
  standard `- [ ]`, each committed by the existing trailing-Space interaction.
- Preserve the source bullet item's indentation when the spaced marker first passes through the
  bullet input rule, and preserve the checked state encoded by the marker.
- Leave the caret immediately after the consumed marker, before the preserved prior content, so
  subsequent typing continues at the user's insertion point.
- Make one undo restore the literal typed marker and the untouched prior content.
- Keep empty-paragraph shortcuts, mid-paragraph literals, and task Markdown serialization unchanged.

## Out Of Scope

- New task syntax or a different trigger key.
- Task conversion after a soft break inside one paragraph.
- Changes to generic bullet/numbered-list input rules unless a shared helper is required to fix the
  task path safely.
- Checkbox interaction or list indentation changes.

## Owner Layer

editor

## Required Coverage

- [x] Input-rule transaction tests for compact, bare, spaced, checked, unchecked, and GFM markers
      placed before existing content.
- [x] Preservation tests for marked/link content and the intermediate bullet-item indentation path.
- [x] Caret-placement and immediate-subsequent-typing tests.
- [x] Undo test restoring the complete literal marker plus the original suffix in one step.
- [x] Markdown serialization/roundtrip assertion proving the preserved task content is durable.
- [x] Browser smoke test reproducing the original `-[]` data-loss case in a loaded document.
- [x] Editor-interaction contract update.

## Implementation Notes

The current rule replaces from the beginning through the end of the parent block with a newly
created empty task node. Build the replacement task with the unmatched suffix content and map the
selection through that replacement. Avoid string-only reconstruction so existing ProseMirror marks
and inline nodes survive.

## Dependencies

- `M07-001-block-editor-preset.md`
- `M07-021-triple-backtick-code-block-input.md` for the established input-rule/undo test harness.

## Verification

- The focused input-rule suite passes with 41 tests covering all accepted markers, inline nodes,
  marks, breaks, caret placement, subsequent typing, one-step undo, and Markdown roundtrip.
- The integrated `0.1.17` gate passes with 86 test files and 743 tests, repository typecheck, both
  production builds, and the installable server-package smoke.
- Production browser QA confirms `-[] ` preserves existing content, saves as task Markdown, and
  reopens as the same task item after a full reload.

## Done When

- Typing `-[] ` at offset zero before existing content creates an unchecked task item and loses no
  content or formatting.
- Every accepted task marker behaves consistently for empty and non-empty paragraphs.
- Undo, save, reopen, and Markdown serialization preserve the expected source.
- Focused tests, the full release checks, and manual browser QA pass.

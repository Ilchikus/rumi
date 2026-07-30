---
status: done
type: feature
milestone: M07
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
  - docs
created: "2026-07-29"
updated: "2026-07-30"
---
# M07-010 Code Block And Toggleable Heading Interactions

## Summary

Fix five related editing defects without changing Rumi's Markdown format or save boundary:

- paste text literally inside an existing code block;
- preserve staged Mod-A block selection for direct replacement while providing Mod-/ as the
  explicit block-menu toggle;
- keep Shift-Enter and all content after the cursor inside the same code block;
- reveal an expanded heading's collapse caret only from the caret's own hit target, not from hovering
  the whole heading row;
- let Enter at the end of a collapsed heading escape its hidden section by adding a divider and
  focusing a visible blank line below it.

The divider becomes a real toggleable-area boundary. It is persisted as the existing
`horizontal_rule`/`---` Markdown syntax; heading collapse state remains presentation-only.

## Problem

Code blocks currently lose their structural boundary during common input:

1. The active paste plugin parses clipboard HTML or plain text as a top-level Markdown fragment even
   when the selection is inside `code_block`. ProseMirror fits that block fragment by splitting the
   code block and placing the paste in a paragraph.
2. A handle-selected block uses a `NodeSelection` while the block-type menu's search takes focus.
   The handle path deliberately defers that focus to preserve native drag start. Typing before the
   deferred focus runs can therefore replace the selected code node through ordinary browser
   editing.
3. Shift-Enter always inserts a `hard_break`. The code schema accepts only text, so ProseMirror fits
   the invalid inline node by ending the code block and moving the remainder into prose.

Toggleable headings also have two mismatches:

1. The expanded caret is shown by the parent heading's hover state, so moving anywhere across a
   heading reveals it.
2. Enter in a collapsed heading currently expands the heading and runs the ordinary split-block
   command. There is no way to continue writing below the collapsed section, and
   `findSectionEnd` does not recognize a horizontal rule as a section boundary.

These failures are risky because the resulting ProseMirror document is valid and can autosave, even
though its structure no longer matches the user's code fence or collapsed-section intent.

## Goals

- Preserve one code block, its language, and all text before and after the cursor for code-local
  paste and Shift-Enter.
- Preserve clipboard whitespace and line breaks literally in code.
- Keep staged Mod-A block selection available for direct replacement and use Mod-/ to toggle the
  existing block-type replacement search.
- Keep handle click/drag behavior intact while closing its deferred-focus input race.
- Make the heading caret's reveal area match the caret control rather than the heading row.
- Provide a one-keystroke escape from a collapsed heading into visible content below its section.
- Make a horizontal rule stop heading-collapse, collapsed-section drag, and collapsed-section drop
  calculations consistently.
- Keep every document-changing interaction undoable as one logical action.

## Out Of Scope

- Changing fenced-code Markdown syntax, language aliases, or syntax highlighting.
- Changing paste interpretation outside code blocks.
- Turning rich clipboard formatting into source code; code uses the clipboard's plain-text
  representation.
- Persisting collapsed/expanded heading state.
- Replacing ProseMirror, the active migrated editor, or its block selection model.
- Redesigning the block context menu or renaming its existing actions.
- Changing ordinary Enter behavior in expanded headings or away from the end of a collapsed
  heading.
- Adding a new divider node or a Rumi-specific source token.

## Owner Layer

editor

## Product Behavior

### Paste Inside Code

Given a text selection or caret inside an existing code block:

- Pasting plain text inserts the exact clipboard text at the selection.
- Newlines, leading/trailing spaces, tabs, blank lines, Markdown punctuation, and URLs remain
  literal code text.
- If both `text/html` and `text/plain` are available, the code block uses `text/plain`.
- A non-empty code selection is replaced, while unselected text before and after it stays in the
  same code block.
- The code block's language attribute is unchanged.
- The document still contains exactly one code block for that fence after the paste.
- The normal non-code URL linking and rich/Markdown paste behavior is unchanged.
- Existing image and PDF clipboard handling remains unchanged; this task only changes textual
  clipboard insertion.

Example:

```text
before
  alpha|gamma

paste
  beta
  delta

after
  alpha beta
  deltagamma
```

The entire result remains within the original fenced block.

### Block Selection And Replacement Menu

When the code block is selected through its handle or area selection:

- The existing block-type replacement menu opens.
- Its search field owns the first printable character, including a character typed immediately
  after the handle click.
- Typing filters the existing block-type choices and Enter applies the focused choice.
- The typed query never replaces or edits the selected code block's source.
- Escape and the existing delete, duplicate, multi-select, and drag interactions retain their
  established behavior.

This requirement includes the short interval between handle selection and the next animation frame.
It is not sufficient for the search field to focus eventually.

The staged keyboard shortcuts are intentionally distinct:

- the first Mod-A selects the current block without opening the menu, so typing replaces the block;
- the second Mod-A selects all blocks;
- Mod-/ toggles the block menu for the existing selection, or selects the current block when there
  is no block selection;
- a second Mod-/ closes the menu without expanding the block selection.

### Shift-Enter Inside Code

Given a caret or text selection inside a code block:

- Shift-Enter inserts one literal `\n`, using code-block newline behavior.
- Text after the cursor remains after that newline in the same code block.
- A selected code range is replaced by the newline.
- The language and surrounding code block are preserved.
- One undo restores the state before Shift-Enter.

Outside code blocks, Shift-Enter continues to insert the existing rich-text hard break.
Mod-Enter remains the explicit command for exiting code.

### Heading Caret Reveal

- A collapsed heading always shows its caret.
- An expanded heading shows its caret when the pointer is over the caret's own hit target.
- Hovering only the heading text or unused heading-row space does not reveal the caret.
- Existing rotation, hit-target size, toggle behavior, and collapsed-section visibility remain
  unchanged.
- A visible keyboard focus treatment, if present on the control, must continue to reveal it.

### Enter At The End Of A Collapsed Heading

Given an empty text selection exactly at the end of a collapsed heading:

1. Determine the end of that heading's complete hidden section.
2. Keep the heading collapsed and keep its existing section content hidden.
3. Insert a horizontal rule at the section end.
4. Insert an editable blank paragraph immediately after the horizontal rule.
5. Place the text cursor in that paragraph and scroll it into view.

The horizontal rule and paragraph are inserted in one transaction. One undo removes the escape
boundary and returns to the prior collapsed-heading document state.

For example, the visible collapsed document:

```text
▸ Project
# Next section
```

may contain hidden child blocks between those two headings. Pressing Enter at the end of `Project`
produces this document order:

```text
# Project
hidden child blocks
---
<focused blank paragraph>
# Next section
```

The hidden child blocks remain hidden. The divider and focused paragraph are visible.

If a horizontal rule already ends the section, reuse that boundary instead of adding a duplicate
rule; focus an existing blank paragraph below it or insert one when necessary.

## Toggleable-Area Boundary Contract

`findSectionEnd` must stop at the first of:

- the next heading with an equal or higher level;
- a horizontal rule;
- the end of the document.

The boundary node is not part of the collapsed section. Therefore:

- collapse decorations do not hide the horizontal rule or anything after it;
- dragging a collapsed heading moves only the heading and blocks before the boundary;
- dropping onto a collapsed heading appends before the boundary;
- nested lower-level headings remain part of the section unless a boundary above ends it.

This boundary applies whenever a heading is collapsed, including after save/reload and a later
collapse action. Only the horizontal rule persists; the collapsed set does not.

## Investigation Findings

The active editor is `migrated/ProseMirrorEditor.tsx`, re-exported by `RumiBlockEditor.tsx`.
Similarly named light/reimplemented editor files are not the production path for this work.

| Reported behavior | Current owner | Finding |
| --- | --- | --- |
| Code paste leaves the fence | `plugins/pasteHandler.ts` | URL paste explicitly opts out in code, but the later HTML and plain-text branches always parse a Markdown document and insert a closed block `Slice`. A reproduced mid-code paste split one code block into `code_block → paragraph → code_block`. |
| Selected code is replaced by typing | `plugins/blockDragHandle.ts` and `blockContextMenuModel.ts` | Handle selection creates a `NodeSelection`; menu search focus is deferred for the handle path to avoid cancelling native drag. There is no guard for printable input during that pending-focus window. |
| Shift-Enter moves the suffix outside code | `keymap.ts` | The binding always inserts `hard_break`; `code_block` is `text*` with marks disabled. A reproduced mid-code hard break produced `code_block → paragraph`, with the suffix in the paragraph. |
| Caret appears on heading hover | `editor.css` | `.heading-block:hover .heading-caret` makes the parent row the reveal trigger. |
| Collapsed-heading Enter expands | `plugins/collapsibleHeadings.ts` | The plugin intercepts every Enter in a collapsed heading, calls `expandHeading`, then `splitBlock`. `findSectionEnd` stops only at equal-or-higher headings. |

Existing focused tests all pass because they cover URL opt-out in code, general key commands, and
the eventual block-menu focus policy separately. They do not cover multiline code paste, Shift-Enter
inside code, the handle focus race, or collapsed-heading escape boundaries.

## Technical Direction

Prefer small commands that can be tested as ProseMirror transactions:

- In the active paste handler, handle textual paste inside `code_block` before URL, HTML, or
  Markdown conversion. Insert the raw plain-text payload with `insertText`/text replacement and
  consume the paste event.
- Give Shift-Enter a code-aware command before the hard-break fallback, using the same literal
  newline semantics as `newlineInCode`.
- Preserve the drag-safe handle timing. Close the focus race by ensuring confirmed handle selection
  hands focus to the search and by consuming/routing printable input while that handoff is pending;
  do not simply break native drag start by preventing the handle's default mousedown behavior.
- Change only the expanded-caret reveal selector and preserve the collapsed and focus-visible
  selectors.
- Add a transaction helper for collapsed-heading escape. Compute the section end from the pre-change
  document, insert/reuse the horizontal-rule boundary and paragraph, map the collapsed heading
  position through the transaction, and set the paragraph selection in that same transaction.
- Centralize the horizontal-rule stop condition in `findSectionEnd` so decorations and existing
  collapsed-section drag/drop consumers share one definition.

Candidate files:

- `apps/web/src/components/editor/migrated/plugins/pasteHandler.ts`
- `apps/web/src/components/editor/migrated/keymap.ts`
- `apps/web/src/components/editor/migrated/plugins/blockDragHandle.ts`
- `apps/web/src/components/editor/migrated/plugins/blockContextMenuModel.ts`
- `apps/web/src/components/editor/migrated/plugins/collapsibleHeadings.ts`
- `apps/web/src/components/editor/migrated/editor.css`
- focused tests beside those modules
- `docs/Contracts/editor-interactions.md`

## Required Coverage

- [x] Editor transaction test: multiline plain text pasted in the middle of code remains literal in
  one code block, with its language and suffix preserved.
- [x] Editor transaction test: code paste preserves leading/trailing whitespace, blank lines,
  Markdown punctuation, URLs, and replacement selections.
- [ ] Regression test: non-code URL, HTML/Markdown, and asset paste behavior remains unchanged.
- [x] Editor command test: Shift-Enter inside code inserts a literal newline and serializes to one
  fence; Shift-Enter in prose still creates a hard break.
- [x] Block-menu interaction test: immediate printable input after handle selection reaches the
  search and does not change the selected code node.
- [x] Heading command tests: collapsed-heading end Enter inserts/reuses one divider at the section
  end, keeps the heading collapsed, and focuses the paragraph below it.
- [x] Section-boundary tests: horizontal rules stop collapse decoration, collapsed-heading drag
  range, and collapsed-heading drop append range.
- [x] Styling/UI smoke: expanded caret appears only over its own target, while a collapsed caret is
  always visible.
- [x] Real-browser smoke: paste, immediate selected-block typing, Shift-Enter, caret hover, and
  collapsed-heading escape all work in the active editor.
- [x] Update the editor interaction contract with the code-local input and horizontal-rule boundary
  behavior.

## Implementation Progress

Implemented on `codex/settings`:

- textual paste inside code now bypasses URL, rich HTML, and Markdown block parsing and inserts the
  clipboard's plain-text payload directly;
- Shift-Enter uses a code-local literal newline command before the prose hard-break fallback;
- handle-selected block menus focus search on confirmed mouseup, while an input guard routes any
  earlier printable key to that search without changing the selected node;
- expanded heading carets reveal from their own hit target;
- `findSectionEnd` treats a horizontal rule as a shared collapse and drag/drop boundary;
- Enter at a collapsed heading's end inserts or reuses that boundary after the hidden descendants
  and focuses a blank paragraph below it.
- the first Mod-A selects the current block, the second selects every block, and Mod-/ independently
  toggles the block context menu without expanding the selection.

## Verification

Automated verification on 2026-07-30:

- focused editor coverage passed: 4 files, 52 tests;
- full repository tests passed: 54 files, 395 tests;
- TypeScript typecheck passed;
- production web build and bundled `@rumi-md/server@0.1.11` build passed;
- manual QA confirmed the reported editor fixes and the final Mod-A/Mod-/ shortcut split.

## QA Scenarios

1. Paste multiple indented lines from a terminal into the start, middle, and end of a typed code
   block.
2. Paste content copied from a rich web page into code and confirm its plain-text representation is
   used.
3. Select part of a code line and paste whitespace-only or multiline text over it.
4. Select the code block by its handle and type immediately, without pausing for the menu animation
   frame.
5. Drag the same handle and confirm the new focus behavior does not cancel or convert the drag.
6. Press Shift-Enter between every pair of lines in a fenced block, undo, redo, save, and reload.
7. Hover the heading text, heading-row whitespace, and caret target separately in expanded and
   collapsed states.
8. Collapse a heading with paragraphs and lower-level headings, place the caret at the collapsed
   heading's end, press Enter, and confirm all old descendants remain hidden above the new divider.
9. Repeat with the section ending at another heading, a pre-existing divider, and the end of the
   document.
10. Drag a collapsed heading whose section ends at a divider and confirm content below the divider
    does not move.

## Done When

- All five reported interactions match the product behavior above in the active editor.
- Code paste and Shift-Enter cannot split a code fence or move its suffix into prose.
- Handle- or area-selected block typing cannot mutate a code node before the replacement search
  receives focus, while staged Mod-A selection remains directly replaceable.
- Horizontal rules consistently break toggleable areas for visibility and drag/drop calculations.
- The editor interaction contract is updated.
- Focused tests, typecheck, production web build, and the real-browser smoke pass.

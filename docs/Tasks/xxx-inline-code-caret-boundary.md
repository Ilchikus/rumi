---
status: idea
type: research
milestone: later
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-12"
updated: "2026-08-12"
---
# Inline Code Caret Boundary

## Status

Deferred. Rumi currently leaves navigation across a completed inline-code boundary to the browser.
The removed custom caret-boundary plugin, DOM markers, selection-affinity state, and input-event
interception are not part of the editor.

This task records the required behavior and evidence from the discarded experiments. It
intentionally selects no implementation and contains no implementation plan.

## Goal

Make the visual caret side, arrow-key movement, and formatting of newly typed text agree at the end
of durable inline code, without introducing a third boundary stop or editor-only copied content.

## Scope

- The closing edge of an existing inline-code mark in the ProseMirror page editor.
- Left and Right navigation across that edge.
- Typing semantics at every visually distinct caret stop.
- Clipboard, Markdown, undo/redo, selection, blur, paste, IME, and real-browser compatibility of
  any eventual boundary behavior.

## Out Of Scope

- The pending opening-backtick input session and its retained macOS double-space normalization.
- Inline code inside filenames, properties, database cells, or other non-page-editor inputs.
- Selecting an implementation mechanism in this deferred task record.

## Owner Layer

editor

## Required Coverage

- [ ] Editor transaction tests prove the mark applied to text inserted from each boundary side.
- [ ] Clipboard and Markdown tests prove that no editor-only boundary material escapes.
- [ ] Real-browser UI smoke covers Safari/WebKit on macOS and at least one Chromium browser.
- [ ] Manual browser verification checks the visible caret and resulting formatting after every
      Left and Right transition.

## Implementation Notes

No implementation is selected. The findings below are evidence and constraints from rejected
experiments, not an implementation plan.

## Problem

The end of an inline-code mark needs two meaningful caret sides even though ProseMirror represents
both with the same document position:

1. Outside the code, where typed text is ordinary prose.
2. Inside the code after its final character, where typed text extends the code mark.

The browser can draw the caret on the code side while ProseMirror still applies outside typing
semantics. It can also expose an additional visually identical stop before reaching the intended
inside state. The visible caret, DOM selection affinity, ProseMirror selection, and stored marks can
therefore disagree.

## Required Behavior

- Typing a closing backtick formats the pending span and leaves the caret outside the resulting
  inline code. Immediate typing remains outside.
- One Left press from that outside position enters the code after its final character. Typing there
  extends the inline code.
- A second Left press moves before the final code character instead of consuming another invisible
  boundary state.
- Right provides the symmetric movement and exits the code without a visually-inside state that
  types outside.
- Navigation does not snap back, skip a character, or jump to another line.
- Copy and cut never include editor-only boundary material. Markdown serialization and saved source
  contain only the real inline-code delimiters and content.
- Mouse selection, blur, undo/redo, paste, IME composition, and native selection behavior remain
  usable around the boundary.

## Findings From Removed Experiments

### ProseMirror And Browser Affinity

- ProseMirror maps the code-end and outside caret to one document position. The browser retains a
  DOM-side affinity at that position that is not fully represented by `TextSelection`.
- A visually inside caret does not prove that subsequent input will receive the code mark.
- Setting stored marks can control typing semantics but does not reliably control which DOM side the
  browser draws or chooses after its own selection normalization.
- Reapplying selection or stored marks after browser updates introduced timing races. Observed
  failures included snapping back into code, refusing to exit, skipping one extra character, and
  jumping to the next line.
- Arrow handlers that forced selection synchronously could disagree with the browser's later native
  movement. Timer-based correction changed the failure timing rather than removing the ambiguity.

### Spacing And Sentinel Characters

- A real trailing space inside inline code produced the most reliable WebKit caret behavior: the
  browser exposed a usable position immediately before that space.
- U+200B zero-width space introduced another WebKit caret stop rather than acting as a transparent
  boundary.
- An ASCII space marked as private/editor-only still behaved inconsistently on macOS and risked
  becoming editable content.
- Sentinel content must not change the durable ProseMirror document, Markdown source, clipboard
  text, code width, or code background.

### Literal Backtick DOM Widgets

- DOM-only literal backtick widgets could remain absent from Markdown and normal clipboard
  serialization.
- A positive-width backtick created an unwanted visible character and an additional navigation
  stop.
- Making the backtick zero-width caused browser normalization to collapse both sides onto the code
  text, so the caret side was still ambiguous.
- Editable widgets could receive text directly. Preventing that required intercepting every
  relevant `beforeinput` path, increasing coupling to browser-specific input behavior.
- Rightward navigation sometimes moved out and immediately returned; leftward navigation sometimes
  required two presses to enter. Other runs skipped a character or moved to the next line.

### Pending Input Session

- The pending opening-backtick session is separate from durable code-boundary navigation and should
  remain independent from any future caret solution.
- macOS double-space punctuation can arrive either as `. ` replacing the existing space or as `.`
  inserted immediately before that space. Both are localized text replacements inside the pending
  span and must not cancel the session before the closing backtick.
- That macOS normalization is retained in the current input-session implementation; it was not part
  of the removed caret-boundary plugin.

## Verification Limits

- Transaction and DOM serialization tests can prove mark placement, saved Markdown, and clipboard
  exclusion, but they cannot prove native caret affinity.
- The boundary behavior must ultimately be checked in real browsers, especially Safari/WebKit on
  macOS, with both visual position and the mark applied to newly typed text verified at every stop.

## Done When

Every item under Required Behavior works in the supported real browsers, the required coverage is
complete, and no editor-only boundary representation appears in source or clipboard output.

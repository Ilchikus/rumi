---
status: verify
type: feature
milestone: M07
release: "0.1.18"
owner_layer: editor
coverage:
  - ui-smoke
created: "2026-10-05"
updated: "2026-10-05"
---
# M07-042 Inline Code Input Survives Paste

## Goal

Typing `` ` ``, pasting, then typing the closing `` ` `` produces inline code, whether the paste
came from a shortcut, the context menu, or a middle click.

## Scope

- In `inputrules.ts`, the pending inline-code session currently ends on any Ctrl or Meta keydown
  and on every `paste` transaction. Change both:
  - Exempt the paste chords (Mod-V, Mod-Shift-V, Shift-Insert) from the keydown cancel.
  - Keep the session through a paste transaction when every change stays inside the pending range
    and the caret ends in the same textblock after the opener. Multi-step transactions are allowed.
- In `pasteHandler.ts`, a paste inside a pending session inserts the clipboard text as plain text.
  That means no link, URL, SVG-file, or rich-mark conversion, since the text is about to become
  code. Multi-line clipboard text ends the session and pastes normally.

## Out Of Scope

- Backtick sessions that were not started by typing, such as an older unmatched backtick. That is
  covered by [Inline-code caret boundary](xxx-inline-code-caret-boundary.md).

## Owner Layer

editor

## Required Coverage

- [ ] Editor tests: opener, paste, closer yields one code mark. Pasting a URL or rich HTML inside a
      session yields plain code text. A multi-line paste ends the session. Undo, arrows, and other
      Mod keys still cancel.
- [ ] Browser check for keyboard, context-menu, and middle-click paste.

## Done When

Every paste path keeps the pending session, and the closing backtick formats the full span.

---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-17"
updated: "2026-08-18"
---
# M07-021 Triple-Backtick Code Block Input

## Goal

Commit a paragraph-start Markdown fence on Enter, carrying its language into the created block.

## Scope

- Keep a paragraph-start triple fence literal while its optional language is being typed.
- On Enter, create a plain code block for a bare fence, a language-tagged code block for an info
  string such as `php`, and an editable Mermaid block for `mermaid`.
- Register PHP in the language picker and syntax highlighter.
- Preserve inline-code input, literal backticks, Markdown serialization, and undo behavior elsewhere.

## Required Coverage

- [x] Keyboard coverage for bare, PHP, and Mermaid fence commits and continued source typing.
- [x] Regression coverage for pre-Enter literals, mid-paragraph, code-block, undo, and interrupted
  inline-code input.
- [x] Full release checks.

## Done When

Pressing Enter after a paragraph-start fence creates the matching semantic block and removes the
fence marker, while all other backtick interactions remain unchanged.

## Verification

- The focused editor suite passes with bare/PHP/Mermaid Enter commits, continued source typing,
  pre-Enter and contextual literals, and one-step undo coverage.
- `corepack pnpm check` and `corepack pnpm check:server-package` pass for the `0.1.16` candidate.
- Real-browser typing remains in the release QA pass.

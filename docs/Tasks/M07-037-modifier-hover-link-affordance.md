---
status: done
type: feature
milestone: M07
release: "0.1.17"
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-29"
updated: "2026-08-31"
---
# M07-037 Modifier-Hover Link Affordance

## Goal

Show the editor's actionable link styling only when an activation modifier is held while the link
is hovered, without underlining every link merely because Command, Control, or Shift is pressed.

## Scope

- Keep ordinary link text unadorned with a text cursor when it is not being activated.
- Apply the existing hover color, underline, and pointer cursor together only to a hovered link
  while the link-activation modifier mode is active.
- Keep the adjacent link marker capable of underlining its link during the same modifier-hover
  interaction.
- Preserve Command/Control-click new-tab activation, Shift-click current-tab activation, ordinary
  click caret placement, and all link marker behavior.

## Out Of Scope

- Changing link destinations, serialization, toolbar editing, or navigation targets.
- Changing which modifier keys activate links.
- Restyling links outside the editor.

## Owner Layer

editor

## Required Coverage

- [x] CSS contract test proving the modifier-mode rule targets hovered anchors and contains the
      hover color, underline, and pointer cursor together.
- [x] Regression assertion proving there is no modifier-mode rule that targets every anchor.
- [x] Existing link interaction suites for click intent, href normalization, selection, and marker
      behavior remain green.
- [x] Browser smoke test for keydown alone, modifier-hover, modifier release, and pointer exit.
- [x] Editor-interaction contract update.

## Implementation Notes

Keep the correction in the presentation selector. The existing link plugin already maintains the
activation-modifier class and link activation semantics; changing event handling would unnecessarily
widen this visual regression fix.

## Dependencies

- `M07-017-editor-selection-and-clipboard-polish.md`
- `M07-023-link-hover-and-caret-boundary-polish.md`

## Verification

- Four focused editor layout and link suites pass with 49 tests.
- The integrated `0.1.17` gate passes with 86 test files and 743 tests, repository typecheck, both
  production builds, and the installable server-package smoke.
- Production browser QA confirms modifier mode toggles on keydown/release without globally
  underlining links; the scoped hover and pointer-exit selector remains covered by the CSS contract.

## Done When

- Pressing Command, Control, or Shift alone does not underline all editor links.
- Hovering a link while an activation modifier is held shows its hover color, underline, and
  pointer cursor together.
- Link navigation and editing behavior remain unchanged.
- Focused tests, the full release checks, and manual browser QA pass.

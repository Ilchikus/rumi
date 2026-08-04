---
status: done
type: feature
milestone: M07
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-04"
updated: "2026-08-04"
---
# M07-014 Native Link Interactions

## Goal

Make links editable as ordinary text while preserving deliberate navigation and the browser's
native link context menu.

## Scope

- Keep a plain primary click inside linked text as a caret-placement action.
- Open linked text in a new tab only on Command-click.
- Add the regular Phosphor ArrowSquareOut affordance after external links.
- Open an external-link icon in the current tab, or a new tab on Command-click.
- Use text cursors and modifier-aware text hover color while keeping the icon independently
  pointer-addressable and hover-colored.
- Prevent secondary-click word selection without suppressing the browser's native link menu.
- Preserve current-tab and new-tab routing for both web and workspace links.
- Use Mod-Shift-K for the toolbar-equivalent link action so Mod-K remains exclusively available to
  application-wide search.

## Out Of Scope

- Replacing the browser context menu.
- Changing Markdown link syntax or persisted destinations.
- Adding a permanent icon to internal workspace links.

## Owner Layer

editor

## Required Coverage

- [x] Editor click-intent and context-menu tests.
- [x] Platform current-tab/new-tab routing test.
- [x] External-link DOM and styling smoke coverage.
- [x] Editor-interaction contract update.

## Implementation Notes

External icons are CSS pseudo-elements so the surrounding element remains a native anchor for the
browser context menu. The click handler uses the icon's final-line hit area to distinguish icon
activation from linked-text caret placement.

## Done When

- Plain linked-text clicks never navigate.
- Command-clicked link text opens in a new tab.
- External-link icons have independent cursor, hover, and tab-disposition behavior.
- Right-click does not create a text selection and the native link menu remains available.
- Focused tests, the full suite, typecheck, and production builds pass.

## Verification

Verified on 2026-08-04:

- focused link interaction, shortcut routing, platform routing, DOM decoration, and styling tests
  passed
- `corepack pnpm typecheck` passed
- the full suite passed: 61 test files and 473 tests
- the production web and bundled `@rumi-md/server` builds passed
- released in `@rumi-md/server@0.1.13` and verified on Personal, ClickOut, and Sandbox

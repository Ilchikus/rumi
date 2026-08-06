---
status: done
type: feature
milestone: M07
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-04"
updated: "2026-08-06"
---
# M07-014 Link Editing And Navigation

## Goal

Make links editable as ordinary text through one Rumi-owned interaction model while preserving
deliberate, platform-aware navigation.

## Scope

- Keep a plain primary click inside linked text as a caret-placement action.
- Open external linked text in a new tab and internal linked text in the current tab on
  Command-click.
- Add the regular Phosphor ArrowSquareOut affordance after external links.
- Open an external-link icon in the current tab, or a new tab on Command-click.
- Use text cursors and modifier-aware text hover color while keeping the icon independently
  pointer-addressable and hover-colored.
- Prevent the browser context menu and secondary-click word selection throughout the app.
- Open the shared link editor from a secondary click on a link, Mod-Shift-K, or the formatting
  toolbar. Focus its URL input and select the full destination so clearing it and pressing Enter
  removes the link.
- Include Apply, Unlink, Copy link, and Open actions in the shared link editor.
- Turn selected text into a link when a URL or workspace path is pasted over it.
- Fall back to selecting every page block when Mod-A is pressed outside an active text-editing
  context.
- Preserve current-tab and new-tab routing for both web and workspace links.
- Use Mod-Shift-K for the toolbar-equivalent link action so Mod-K remains exclusively available to
  application-wide search.

## Out Of Scope

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

External icons are CSS pseudo-elements. The click handler uses the icon's final-line hit area to
distinguish icon activation from linked-text caret placement. Link resolution and editor-opening
logic are shared by toolbar, keyboard, hover, and secondary-click entry points.

## Done When

- Plain linked-text clicks never navigate.
- Command-clicked external links open in a new tab, while internal links use the current tab.
- External-link icons have independent cursor, hover, and tab-disposition behavior.
- Right-click never opens the browser context menu, and right-clicking a link opens the shared link
  editor without changing the text selection.
- The link editor selects the URL on open, removes the mark when an empty URL is submitted, and can
  copy or open the current destination.
- Pasting a URL or workspace path over selected text creates a link without replacing its label.
- Mod-A outside text editing selects all blocks on the current page.
- Focused tests, the full suite, typecheck, and production builds pass.

## Verification

Verified on 2026-08-04:

- focused link interaction, shortcut routing, platform routing, DOM decoration, and styling tests
  passed
- `corepack pnpm typecheck` passed
- the full suite passed: 61 test files and 473 tests
- the production web and bundled `@rumi-md/server` builds passed
- released in `@rumi-md/server@0.1.13` and verified on Personal, ClickOut, and Sandbox

Interaction follow-up verified on 2026-08-06:

- focused application-browser, link selection, link plugin, paste, and toolbar coverage passed
- regression coverage confirms that a caret immediately after a non-inclusive link is not treated
  as part of the link, Control-click is secondary-click only on macOS, and the link editor remains
  available when the formatting toolbar is hidden
- `corepack pnpm check` passed with 68 test files and 510 tests, typecheck, the production web
  build, and the bundled server build
- `corepack pnpm check:server-package` verified the installable `@rumi-md/server@0.1.14`
- user visual QA was approved for the release candidate

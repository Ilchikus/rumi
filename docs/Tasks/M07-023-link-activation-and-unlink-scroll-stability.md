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
# M07-023 Link Activation And Unlink Scroll Stability

## Goal

Open links in the correct browsing context and remove links without moving the editor viewport.

## Scope

- Keep plain linked-text click as caret placement.
- Open external links in a new tab and internal workspace links in the current tab from explicit
  activation affordances.
- Keep Copy, Open, Unlink, and Apply as compact icon actions beside the destination input. After a
  successful copy, replace Copy with a checkmark for 500 milliseconds before closing the editor.
- Open the shared link editor from right-click or the formatting toolbar, never from hover.
- Keep the right-click-opened editor active through primary-button pointer sequences so every compact
  action receives its click.
- Render one variant-driven link-marker component before every anchor in the ProseMirror document.
  Its external variant uses the Phosphor Globe and its internal variant uses the page, folder, or
  database glyph. The marker has real caret positions before and after it. Markdown and portable clipboard
  serialization omit the atom and emit only `[label](destination)`. Applying a link places the
  caret after the complete anchor; moving right enters anchor editing, moving left exits, and
  Backspace on the anchor side or with only the marker selected removes only the destination while
  retaining its text.
- Render mentions and custom-label internal links through that same marker while retaining their
  distinct anchor text. The mention flag affects only anchor and source semantics; internal and
  external forms share the node type, DOM component, zero-line-box, click, right-click,
  caret-boundary, apply, and unlink behavior.
- Size both glyphs to `1.2em` so they scale with paragraph and heading typography, and use the same
  regular Phosphor weight for the Globe and internal page/folder/database glyphs. Measure the caret
  before either leading atom from the containing textblock's computed font size, including when the
  link begins a line, and include the atom in the visible highlight for a complete anchor selection
  without adding it to copied or saved text.
- Treat each leading atom as an explicit link affordance: an ordinary click opens external links in
  a focused new tab and internal links in the current window, Mod-click opens either kind in a
  focused new tab, and Shift-click opens either kind in the current window. Keep ordinary anchor
  clicks as caret placement while giving anchor Mod-click and Shift-click the same explicit targets.
- Give the internal-path field only a bottom border and align its normal-weight input and suggestion
  text on one baseline. Keep the suggested path muted except for the exact query match, which uses
  foreground text. Cycle suggestions only with Up/Down; Tab accepts without applying, while Enter
  accepts the active canonical path before applying so a search query is never stored as the href.
- Include pages, folders, and databases in destination search. Folder and database results store
  their existing `.index.md` and `.db.md` companion paths, and a direct title/basename match outranks
  descendant paths that merely share the same directory prefix.
- Render external anchors semibold with a regular-weight Globe glyph matching internal link icons.
- Exclude the right-click link editor from block area-selection capture so primary clicks execute
  only its context action.
- Preserve the logical selection and editor-canvas scroll offset when unlinking.

## Required Coverage

- [x] Link intent coverage for external, internal, modifier, context-menu, and toolbar activation.
- [x] External-icon caret-boundary coverage for anchor editing, apply placement, and unlinking.
- [x] Icon-only text-selection Backspace coverage preserving the anchor text.
- [x] Full primary-pointer-sequence coverage for actions in a right-click-opened link editor.
- [x] Block area-selection exclusion coverage for the right-click link editor.
- [x] Internal-link kind metadata, shared mention-visual, atom-boundary, apply, conversion, and
  right-click coverage.
- [x] Font-relative boundary-caret and icon-inclusive text-highlight coverage.
- [x] External/internal icon click, Mod-click, Shift-click, and focused-tab coverage.
- [x] Compact, accessible icon-action layout coverage.
- [x] Canonical suggestion acceptance, match highlighting, structural companion ranking,
  Up/Down-only navigation, and copy-confirmation coverage.
- [x] Long-document unlink coverage proving scroll stability.
- [x] Editor interaction contract update and full release checks.

## Done When

Every explicit link action uses the approved destination, both derived glyphs participate in caret
movement, and unlinking preserves both the anchor text and viewport.

## Verification

- Link intent tests cover plain anchor caret placement, focused Control/Command new-tab activation,
  and raw-DOM Shift-click current-window activation for external and workspace destinations;
  modified mousedown is consumed before ProseMirror selection handling, while secondary mousedown
  and right-click open the shared editor and hover creates no UI.
- Link-plugin tests prove the leading external atom is outside the anchor mark, crossing it changes
  the real document position, icon-side typing extends the anchor, and Backspace there removes the
  mark while retaining the text. Selecting only that atom and pressing Backspace follows the same
  unlink path. They also prove the font-relative boundary caret and the icon-inclusive
  complete-anchor highlight decoration.
- Internal-link tests prove its leading atom crosses between the outside and anchor sides with arrow
  keys, primary click follows the atom-owned destination without relying on DOM-position mapping,
  right-click opens the shared editor, and Backspace removes the mark but keeps the anchor. Mention
  parsing and insertion tests prove mentions use that same internal-link atom rather than a separate
  pseudo-element renderer. Toolbar tests also cover creation and internal/external destination
  conversion.
- Link context-menu tests send pointerdown, mousedown, mouseup, and click through a real action and
  prove it executes instead of merely closing the popup. The toolbar carries the area-selection
  exclusion contract consumed during the block selector's capture phase.
- Selection-toolbar tests prove all four accessible icon actions share the destination-input row,
  and a complete primary-pointer sequence applies an external destination, creates its frontend
  atom, and leaves the caret after the complete link. They also prove input/suggestion alignment,
  normal-weight exact-match coloring, folder/database companion priority, Up/Down-only cycling,
  Enter's canonical-path acceptance, and the 500-millisecond copy checkmark.
- The selection-toolbar test resets the real editor-canvas scroll offset during focus and proves
  unlink restores both axes and retains the logical selection.
- `corepack pnpm check` and `corepack pnpm check:server-package` pass for the `0.1.16` candidate.

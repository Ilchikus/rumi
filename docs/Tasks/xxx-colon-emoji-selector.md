---
status: done
type: feature
milestone: later
owner_layer: editor
coverage:
  - markdown
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-07-29"
updated: "2026-07-29"
---
# Colon Emoji Selector

## Summary

Typing `:` in an eligible prose position opens Rumi's own caret-anchored emoji selector. The text
after the colon is the live search query:

```text
editor text        :smile
selector query     smile
focused result     😄  grinning face with smiling eyes

Enter
  -> replace `:smile` with `😄`
  -> keep the caret after `😄`
  -> persist literal UTF-8 `😄` through normal autosave
```

Rumi owns the selector UI, search, ranking, keyboard behavior, and insertion transaction. It does
not add an emoji-picker package.

## Problem

Emoji are valid Markdown text but are cumbersome to discover and type consistently across
operating systems. The operating-system picker is disconnected from the active editor query, and a
third-party picker would add a large visual and behavioral dependency to a core writing
interaction.

Rumi should provide a fast keyboard path that behaves like its existing `/` and `@` suggestion
surfaces while keeping the inserted result portable, literal Unicode.

## Goals

- Open an emoji selector from a valid `:` trigger without moving focus out of the editor.
- Treat the characters after `:` as a live search query.
- Focus the best match deterministically; `:smile` focuses `😄`.
- Replace the complete colon-plus-query range when the user presses Enter.
- Support keyboard and pointer selection, viewport-aware placement, and accessible result labels.
- Use a checked-in, reproducible emoji search index and native emoji rendering.
- Preserve the exact inserted Unicode sequence through Markdown serialization, autosave, reload,
  copy/paste, revision history, and external editors.
- Apply its workspace setting to an open editor without remounting or losing history.

## Non-Goals

- A third-party emoji-picker UI or runtime dependency.
- Downloading an emoji catalog, images, or search results at runtime.
- Shipping platform-specific emoji artwork or a bundled emoji font.
- Workspace-uploaded custom emoji in the first release.
- Replacing pasted `:shortcode:` text.
- Rewriting shortcode-like text when a page opens.
- Locale selection or translated search indexes in the first release.
- Emoji reactions, comments, or presence.

## Interaction

### Opening

- A typed `:` opens the selector when it is at the start of a prose text block or immediately after
  whitespace or an opening delimiter such as `(`, `[`, or `{`.
- It does not open inside a word, number, URL, timestamp, or source-like token. `note:value`,
  `12:30`, and `https://rumi.md` remain ordinary text.
- It does not open in a code block, Mermaid source, inline code, a link destination, title,
  property, database cell, NodeView control, read-only editor, or active IME composition.
- Only one editor suggestion surface may be active. Opening `:`, `/`, or `@` closes any other
  suggestion surface without deleting its typed text.

The selector opens as soon as the valid colon is inserted. With an empty query it shows recent
emoji when available, followed by a stable small set of commonly used emoji.

### Live Query

- The colon and query remain actual ProseMirror text while the selector is open.
- Editor focus and the real caret stay after the query. The selector contains a visual search row
  that mirrors the query without moving DOM focus to a second input.
- The displayed search query omits the leading colon.
- Letters, numbers, `_`, `-`, and `+` extend the query. Search is case-insensitive.
- `_` and `-` are normalized to spaces for matching, so `:red_heart` and `:red-heart` search for
  `red heart`.
- Typing whitespace or ordinary punctuation closes the selector and preserves the literal colon
  query plus the new character. Multi-word search uses `_` or `-`.
- Backspace edits the query. Deleting the trigger colon closes the selector.
- Moving the selection outside the active query range closes the selector and preserves the text.
- Escape closes the selector and preserves the exact typed text, so `:smile` remains `:smile`.
- Paste, drop, programmatic insertion, page load, and external reconciliation never open or update
  the selector.

### Search And Focus

Search uses the English short name, keywords, Rumi aliases, and normalized query tokens.

Ranking is deterministic:

1. exact Rumi alias;
2. exact short name;
3. alias or name word-prefix match;
4. all query tokens matching name or keyword prefixes;
5. all query tokens matching name or keyword substrings;
6. stable Unicode/CLDR catalog order as the final tie-breaker.

There is no edit-distance fuzzy search in the first release. Prefix and keyword matching are easier
to understand and keep focus stable as the query grows.

The initial Rumi alias table includes familiar keyboard names whose desired result should not
depend on changing catalog wording. At minimum:

| Alias | Focused emoji | Short name |
| --- | --- | --- |
| `smile` | `😄` | grinning face with smiling eyes |
| `slight_smile` | `🙂` | slightly smiling face |
| `joy` | `😂` | face with tears of joy |
| `laugh` | `😂` | face with tears of joy |
| `wink` | `😉` | winking face |
| `heart` | `❤️` | red heart |
| `thumbsup`, `+1` | `👍` | thumbs up |
| `thumbsdown`, `-1` | `👎` | thumbs down |
| `fire` | `🔥` | fire |
| `party` | `🎉` | party popper |
| `check` | `✅` | check mark button |
| `eyes` | `👀` | eyes |

Aliases are searchable metadata, not stored shortcode syntax. Selecting an item always inserts its
literal emoji sequence.

### Selection

- The best result is focused whenever the query changes. For `:smile`, `😄` is focused.
- Left and Right move one result through the visual grid.
- Up and Down move by one rendered row while preserving the closest column.
- Home and End move to the first and last visible result.
- Enter inserts the focused result.
- Pointer hover moves focus; pointer-down inserts without moving the editor selection first.
- The focused result scrolls into view inside the selector.
- When there are no results, Enter closes the selector and performs the editor's normal Enter
  behavior, leaving the literal query in the document.

Tab does not select an emoji in the first release. It retains the editor's existing table, list,
and code behavior after closing the selector.

### Insertion And Undo

Selecting an emoji:

1. replaces the range from the trigger colon through the current query;
2. inserts the exact emoji code-point sequence;
3. inherits the active inline marks at that position;
4. places and scrolls the caret immediately after the emoji;
5. closes the selector and restores ordinary editor key handling;
6. marks the document dirty for normal autosave.

The selection is one editor history event. One immediate `Cmd/Ctrl+Z` restores the exact colon
query, such as `:smile`; redo restores the selected emoji. The selector does not automatically
reopen during undo or redo.

## Selector Design

The selector is a non-blocking surface anchored eight pixels below the caret. It flips above when
there is insufficient space, stays within eight pixels of the viewport edges, and scrolls
internally when its content cannot fit.

Recommended initial layout:

- 320-pixel preferred width, capped to the narrow viewport;
- mirrored query row at the top;
- compact result grid using native emoji glyphs;
- visible focused state using the existing neutral/sky editor menu palette;
- focused emoji name in a compact footer or tooltip;
- empty state reading `No emoji found`;
- recent results before the catalog only when the query is empty.

This behaves like a picker modal in purpose, but remains an anchored suggestion popover on normal
viewports so the typed query and caret stay spatially connected. On a narrow touch viewport it may
use the same data and interaction state in a bottom sheet if the anchored grid is not usable.

The selector must not shift editor layout or create a second editable text field. Native emoji
rendering intentionally follows the operating system; Rumi does not bundle images or force every
platform to render identical artwork.

## Accessibility

- Expose the result collection and items with appropriate listbox/option or grid/gridcell roles.
- Give every item an accessible short name; never announce only the glyph.
- Expose the focused option through `aria-activedescendant` or an equivalent active-option
  relationship while keeping DOM focus in the editor.
- Announce the result count and focused emoji name without announcing the full grid after every
  keystroke.
- Ensure the focused state is visible without relying on color alone.
- Keep keyboard selection and pointer hover synchronized.
- Test browser zoom and narrow viewports as well as ordinary desktop layout.

## Emoji Data Without A Picker Package

Check a compact generated emoji index into the web source. Generate it from pinned releases of:

- [Unicode's emoji data](https://www.unicode.org/Public/UCD/latest/emoji/) for fully-qualified
  sequences and group ordering;
- [CLDR annotations](https://www.unicode.org/cldr/charts/latest/annotations/index.html) for English
  emoji short names and search keywords;
- Rumi's small reviewed alias table.

The generated data contains only what the client needs:

```text
emoji sequence
short name
normalized keywords
group and subgroup
stable order
optional base/skin-tone relationship
```

The generator records the upstream release identifiers and retains the required
[Unicode license notice](https://www.unicode.org/copyright.html). Unicode data files are available
under the permissive Unicode License; the checked-in attribution must be reviewed when the dataset
is introduced.

Do not:

- copy source code or UI from another picker;
- add an emoji-picker runtime or build dependency;
- fetch Unicode or CLDR data in the production build;
- fetch data when the selector opens;
- store remote image URLs.

A maintainer runs the generator deliberately when upgrading the catalog, reviews the generated
diff, and commits the data. The application bundle serves the resulting static index offline.

### Sequences And Skin Tones

Emoji may be a single code point or a multi-code-point sequence containing variation selectors,
zero-width joiners, flags, or skin-tone modifiers. Rumi inserts the exact fully-qualified sequence
from the checked-in index and never normalizes, splits, or reconstructs it during save.

Search results initially show one base tile for an emoji with skin-tone variants. A secondary
pointer hold or keyboard action may expose its variants, but that variant surface is not required
for the first keyboard-search slice. The underlying data model must retain the relationship so
variants can be added without replacing the catalog.

## Recents And Privacy

- Store a bounded recent-emoji list in browser-local UI state, not Markdown or workspace
  configuration.
- Scope recents to the current browser profile; they are a personal convenience and do not sync in
  the first release.
- Selecting an emoji moves it to the front without creating duplicates.
- Missing emoji after a catalog upgrade are ignored safely.
- If browser storage is unavailable, the selector falls back to the stable common set.

## Settings

Add a separate workspace editor setting:

```text
Emoji suggestions                                   [on]
Open an emoji selector when typing : in prose.
```

Recommended contract:

```json
{
  "editor": {
    "highlightMisspellings": false,
    "inlineReplacements": true,
    "emojiSuggestions": true
  }
}
```

The setting defaults to `true`. Changing it affects subsequent typing in an open editor without
remounting the editor or changing existing content, selection, or undo history. It is independent
from Inline replacements: disabling automatic punctuation does not have to disable emoji search.

## Persistence And Encoding

The selected emoji becomes literal ProseMirror text and literal UTF-8 Markdown. No shortcode,
HTML entity, image reference, or Rumi-specific node is stored.

This is compatible with Rumi's file model. UTF-8 supports both single-code-point emoji and
fully-qualified sequences. The Markdown serializer and runtime must preserve the exact sequence,
including variation selectors and zero-width joiners. Whole-document Unicode normalization is not
part of the feature.

Search for the original `:smile` query will not find the inserted `😄`; this is the intentional
result of replacing source text. Copying from the editor or source copies the emoji itself.

## Technical Direction

Add a dedicated ProseMirror suggestion plugin with:

- plugin state for active/query/range/focused-result;
- a pure emoji search-and-ranking module;
- a static generated data module or JSON asset;
- a caret-positioned selector view using Rumi's editor menu tokens;
- one insertion transaction that replaces the tracked range;
- coordination that allows only one of the colon, slash, and at-mention menus to be active.

The query should be derived from the tracked ProseMirror range rather than maintained in an
independent input. The plugin must map or invalidate that range across transactions and close
safely when selection or document changes make the range stale.

The initial implementation can reuse the proven placement principles and interaction semantics of
the existing `/` and `@` plugins, but should keep emoji data, ranking, and view code independent so
it can be tested without a browser DOM.

## Acceptance Criteria

- Typing `:smile` at a valid position opens the selector, displays `smile` as the query, and focuses
  `😄`.
- Enter replaces the exact `:smile` range with `😄`, places the caret after it, and closes the
  selector.
- The inserted emoji is returned by `getMarkdown()`, written literally on autosave, and unchanged
  after reload.
- Search ranking follows the documented exact/prefix/keyword order and remains stable.
- Arrow keys, Enter, Escape, Backspace, selection movement, and pointer selection behave as
  specified.
- Escape leaves the exact query text unchanged.
- Code, Mermaid, inline code, URLs, timestamps, words containing colons, paste, load, and
  programmatic changes never activate the selector.
- One undo restores the exact query and redo restores the emoji without reopening the selector.
- The surface stays within the viewport, flips when needed, scrolls internally, and exposes an
  accessible focused option.
- Disabling and re-enabling Emoji suggestions affects an open editor without remounting it.
- The production application uses no emoji-picker package, runtime catalog request, remote emoji
  image, or bundled emoji font.
- Multi-code-point emoji sequences roundtrip byte-for-byte through Markdown save and reload.

## Required Coverage

- [x] Pure search tests cover exact aliases, names, keyword prefixes, multiple tokens, separator
  normalization, deterministic ties, and `smile` focusing `😄`.
- [x] Plugin tests cover valid/invalid triggers, query range tracking, menu coordination, insertion,
  caret placement, marks, no-result Enter, Escape, and exact undo/redo.
- [x] Negative tests cover code, Mermaid, inline code, URL, time, paste, load, reconciliation,
  programmatic insertion, IME composition, and stale ranges.
- [x] Data tests reject duplicate exact aliases, missing accessible names, invalid sequences, and
  unstable order.
- [x] Markdown tests cover single-code-point, variation-selector, skin-tone, flag, and ZWJ
  sequences.
- [x] Runtime/API tests cover the normalized `emojiSuggestions` setting, default, validation, and
  configuration preservation.
- [x] Real-browser smoke covers `:smile` through Enter, live Settings disablement, and a
  saved/reloaded source file; focused component and plugin coverage protects keyboard movement,
  pointer selection, undo/redo, viewport flipping, and narrow placement.
- [x] File-format and editor-interaction contracts document the setting and durable literal output.

## Later

- Localized CLDR search indexes and locale selection.
- A toolbar button for pointer-first discovery.
- A complete skin-tone variant chooser and browser-local preferred tone.
- Category tabs when the selector is opened with an empty query.
- Workspace-uploaded custom emoji with an explicit portable fallback design.
- Search folding between selected emoji and known aliases, if exact-search semantics remain clear.

## Related Work

- [Inline Text Replacements](xxx-inline-text-replacements.md)

## Delivered

Rumi now owns a reusable controlled `EmojiPicker` component with configurable presentation,
columns, result set, focus, and selection callback. The editor adapter tracks the real ProseMirror
query range and renders the picker at the caret. The same component supports centered and inline
presentations for future workspace and page/folder/database icon selectors.

A reproducible dependency-free generator pins Unicode 17 and CLDR 48, checks 1,914 searchable
native emoji entries into the web client, and includes the Unicode 3.0 license notice. No picker
package, remote catalog, remote image, or emoji font is used.

Verified on 2026-07-29 with search, placement, editor transaction, undo/redo, Markdown sequence,
runtime/API settings, full repository, and production build coverage. A real Chrome smoke confirmed
that `:smile` focused `😄`, Enter inserted and autosaved the literal emoji, and disabling Emoji
suggestions kept the query literal without opening the picker.

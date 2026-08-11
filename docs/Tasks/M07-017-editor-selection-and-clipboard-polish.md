---
status: doing
type: feature
milestone: M07
owner_layer: editor
coverage:
  - ui-smoke
  - docs
created: "2026-08-07"
updated: "2026-08-11"
---
# M07-017 Editor Selection And Clipboard Polish

## Goal

Make block selection reversible in both pointer and keyboard flows, make inline-code and URL paste
behave predictably, improve portable paragraph copy, and expose the open page's shareable URL and
canonical workspace path through one action surface.

## Scope

- Let Command-click on macOS and Control-click on Windows/Linux add or remove any block handle from
  an explicit selection, including non-contiguous selections. A subsequent Shift-Up/Down grows or
  shrinks the most recently Command-selected group without discarding earlier selected groups.
  Primary-modifier marquee selection likewise toggles its complete area against the existing block
  selection, so multiple non-contiguous areas remain selected.
- Treat Shift-Up/Down on an explicit contiguous block selection like an anchored range: moving back
  toward the anchor removes the last selected block, while moving past a one-block selection adds
  the adjacent block in that direction. Retain Shift-Mod-Up/Down document-edge behavior.
- Rename the paragraph block choice from **Text** to **Paragraph** and let friendly aliases such as
  `p`, `text`, `h2`, and `heading 2` focus the expected Change type or slash-command result.
- Copy adjacent paragraph blocks with one line per paragraph in both plain text and portable HTML
  so normal and plain-text Google Sheets paste do not insert blank rows. Preserve exact Rumi
  structure through the private clipboard flavor. Native text selections copy only selected text
  and inline marks; list and checkbox syntax remains exclusive to explicit block selections.
- Preserve inline-code formatting when normal paste replaces the complete contents of one inline
  code span. Make the inline-code mark non-inclusive so typing after a completed backtick shortcut
  occurs outside the mark. A typed opening backtick starts an action-scoped pending session rather
  than searching backward through the paragraph. Closing within that uninterrupted session creates
  the durable code mark; caret movement, navigation, blur, paste, or another structural action
  cancels it and leaves literal backticks that serialize escaped. Mod-Z immediately after closure
  restores both literal delimiters. At a durable closing boundary, Left explicitly enters the code
  mark in one keypress and keeps subsequent typing inside it until Right exits. Right from the final
  code character moves directly outside instead of stopping at a code-side caret that types outside.
- Treat `http://`, `https://`, `www.`, and bare domain destinations as URL paste. Normal paste over
  highlighted text retains the highlight as the link label; normal paste at a caret inserts the
  clipboard text as both label and stored destination. Render scheme-less web destinations through
  HTTPS without rewriting their portable Markdown destination.
- Keep paste-as-plain-text literal at both a caret and a highlighted range, including when the text
  happens to be a URL or domain.
- Add **Copy URL** and **Copy relative path** to the current-page File actions menu and route their
  keyboard shortcuts through the same callbacks. Copy URL uses the current canonical application
  route and origin; Copy relative path uses the canonical workspace-root-relative path beginning
  with `/` and including its Markdown filename where applicable.
- Keep durable link state source-controlled: literal URL, `www.`, email, and domain patterns in a
  file remain text unless explicit Markdown link syntax marks them as links. Normal URL/domain
  paste writes that explicit syntax on save, while paste-as-plain-text remains literal.
- Bump the distributable `@rumi-md/server` release candidate to `0.1.15`.
- Preserve each flat list item's indentation when converting among bullet, numbered, and task list
  types.
- Add child creation to sidebar node menus: folders offer page, folder, and database; databases
  offer page only.
- Let primary-modifier **New Page** from a sidebar folder/database menu skip the inline naming row,
  open the created page, and select its default title. Apply the same immediate open/title selection
  to primary-modifier click on a database view's **New** button while keeping ordinary creation in
  the table's inline name editor. Load the created page before refreshing the sidebar tree, and open
  a database-created record before hydrating it back into the table, so navigation wins the first
  visible update. Project the canonical page path returned by either create command into the
  in-memory sidebar tree immediately, keep runtime ordering, and reconcile it through the normal
  authoritative tree refresh without introducing a second source of truth.

## Out Of Scope

- Dragging blocks into databases.
- Current-page find and replace.
- Global search behavior.
- Changes to Markdown link syntax or application slug allocation.

## Owner Layer

editor, with current-page action wiring in the web shell.

## Required Coverage

- [x] Editor selection tests for modifier toggling, non-contiguous selection, anchored shrinking,
      direction reversal, and document-edge extension.
- [x] Block-type presentation tests for Paragraph naming and friendly Change type aliases.
- [x] Slash-command tests for Paragraph creation and friendly aliases.
- [x] Clipboard serialization tests for adjacent paragraphs, list continuity, and text selections
      inside task items.
- [x] Paste transaction tests for inline-code replacement, generic domains, and explicit plain-text
      URL paste.
- [x] Inline-code input/session, escaped-source, undo, and boundary tests.
- [x] Current-page action and shortcut tests for copied URL/path values and availability guards.
- [x] Sidebar child-creation matrix coverage.
- [x] Optimistic sidebar-tree insertion, ordering, deduplication, and missing-parent coverage.
- [x] List-type conversion indentation coverage.
- [x] Editor-interaction contract update.
- [x] Full typecheck, tests, production build, and server-package release check.

## Done When

- Pointer and keyboard block selections can grow and shrink without losing their anchor.
- Primary-modifier marquees toggle additional block ranges without discarding earlier ranges.
- Paragraph and heading type queries use the names users naturally type.
- Sheets receives adjacent paragraphs without empty rows, Rumi structure remains intact, and text
  selections do not acquire their containing list or checkbox syntax.
- Normal and plain-text paste have distinct, predictable URL and inline-code behavior.
- A durable inline-code closing boundary has only two intentional caret states: outside, or inside
  after one Left press; the next Left moves through the code text instead of consuming another
  invisible boundary state, and Right crosses the closing edge without a typing-affinity stop.
- Modified **New Page** actions from sidebar containers and database views add the returned page to
  the current sidebar tree and open it with its default title selected before sidebar/table
  hydration, while ordinary creation keeps the existing inline naming flow.
- The open page's public URL and canonical relative path can be copied from both the File actions
  menu and documented shortcuts.
- The installable server package passes its `0.1.15` release check.

## Verification

Verified through 2026-08-11:

- focused editor, clipboard, link, modified-creation ordering, multi-area selection, current-page
  action, and application-shortcut coverage passed
- `corepack pnpm check` passed with 71 test files and 568 tests, typecheck, the production web
  build, and the bundled server build
- `corepack pnpm check:server-package` verified the installable `@rumi-md/server@0.1.15`
- user browser QA remains pending before merge

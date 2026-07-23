---
status: done
type: feature
milestone: M07
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
  - docs
created: "2026-06-23"
updated: "2026-07-22"
---
# M07-001 Rumi Block Editor Preset

## Goal

Assemble the official Rumi block editor preset on top of the ProseMirror foundation.

## Scope

- Extension/command registry.
- Slash commands.
- Block handles and block context menu.
- Selection toolbar.
- Rich NodeViews for code, images, files, bookmarks, Mermaid, tables, and databases.
- Themeable styling and NodeView skins.

## Out Of Scope

- Replacing ProseMirror as the editor foundation.
- Changing Markdown/frontmatter as the canonical file contract without a separate decision.
- Refactoring the migrated editor internals before functional parity is established.

## Notes

Migrate the proven editor as one functional subsystem. Keep its editing behavior intact and isolate
browser/backend differences behind adapters; refactor only after parity is established.

## Done When

- The light editor can be upgraded to the official block preset without changing runtime/API contracts.
- Rich block features are covered by Markdown roundtrip tests and UI smoke checks.

## Progress

The proven editor's schema, Markdown pipeline, key bindings, input rules, interaction plugins,
NodeViews, and styling now run inside the new web client. The preset includes Markdown and slash
creation, per-item block handles, bulk and area selection, block-gap drag/reorder with optional
rightward list indentation, block conversion, selection formatting, link editing, `@` document
links, collapsible headings, code and Mermaid controls, table controls, and bookmark, file, image,
and database NodeViews.

Electron and direct-filesystem dependencies were replaced with client adapters for internal
navigation, asset URLs/uploads, messages, and the new database API. The flat-list indent model is
kept during this parity phase and still serializes to nested Markdown. Database relations remain out
of scope pending Decision 019. Unit/roundtrip tests, production build, and real-browser drag,
indent, gutter-handle, slash-menu, and autosave checks cover the migrated integration.

Oversized table blocks keep a content-column-width parent and scroll internally on both axes rather
than widening the editor or the page. A focused style contract and a real-browser overflow check
cover the wrapper width, capped height, and independent horizontal and vertical scroll positions.

List drag indentation uses geometry from the actual drop context: the first level begins after 30%
of the editor width, while nesting below an already-indented target begins after 20% of that target
block's own remaining width. The drop indicator uses the same 1.5em-per-level offset as rendered
list items, and focused tests protect the boundary and maximum-depth behavior.

Command-D is a block-level duplicate command: an explicit single/multi-block selection wins, and a
text cursor falls back to its containing top-level block. Duplicates become the active block
selection and remain one undoable transaction. Mermaid now uses the regular Phosphor Flow Arrow SVG
through the canonical icon source shared by the handle and slash menus.

Full-page and embedded database tables now share the default editor article width and the same
bounded two-axis overflow behavior. Their shared view has no manual refresh action, outer rounded
border, section-level top/bottom separators, or last-row bottom rule. Component coverage protects
the presentation contract, and a real-browser check confirms the full database and normal page both
use an 820px article at desktop width.

Database tables also share one record-selection model in both placements: a leading checkbox selects
one record, the header checkbox selects all currently visible records, and a contextual action strip
offers exactly Duplicate, Move, and Delete. Duplicate creates canonical Markdown records through the
database command, Move uses workspace container destinations, and Delete uses the recoverable Trash.
Record names and ordinary text properties wrap with their rows rather than truncating. Entering record
rename keeps the existing table appearance, adds no field border or background, and places the caret at
the end for both existing and newly created records.
Each shared database table header also exposes a drag target for changing that column's width. Full-page
and embedded instances read the same browser-local width preference, scoped by workspace, database, and
view, without writing personal presentation state into the database schema.
Resizable headers keep a subtle vertical divider as the visual boundary, while the record Name editor
does not flash a focus border before entering its plain inline edit state.
The read and edit states share one box model, wrapping width, padding, and line height. Textarea height
is measured in the layout phase before paint, so entering rename does not move the text baseline or
change the row height.

Code blocks use the shared styled dropdown presentation for language selection. The menu includes a
focused search field, filters canonical languages and common aliases, and writes the selected language
back to the Markdown fence without relying on the operating system's native select control.

The slash-command menu is anchored in the editor's scrolling canvas, so browser layout moves it with
the active line without per-scroll JavaScript. It opens below the active line when it fits, flips
above near the bottom edge, clamps horizontally, and uses the larger available side with an internally
scrolling height when neither side can show the complete menu. Focused geometry tests protect the
placement boundaries and the conversion from viewport to canvas coordinates.

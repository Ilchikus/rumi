# Product Changelog

This is a short, product-focused record of changes shipped in the public `@rumi-md/server`
package. It describes what changed for people using Rumi rather than implementation details. New
entries go first; releases without meaningful product-behavior changes may be omitted.

## 0.1.18 — 2026-10-09

- Added icons for pages, database records, folders, databases, and the workspace: pick an emoji, a
Phosphor icon, or an uploaded image. Icons are stored in the item's own frontmatter and replace the
default icon in the sidebar, breadcrumbs, search, database tables, and `@` mentions; the
workspace icon also becomes the browser-tab icon.
- `@` mentions now follow renames: the mention text updates to the new title.
- Page titles sit lower, leaving room for the page icon below the header.
- Settings now shows the running version and marks an available update. Global npm installs can
update and restart from Settings; other installations show the command to run.
`--no-update-check` turns update checks off.
- An expired or revoked session now shows the sign-in screen over the open page instead of error
messages. Signing in saves pending edits and keeps you on the same page.
- Empty lines between blocks are kept after reloading, and numbered lists keep counting across them.
- Pasting no longer cancels inline code that was started with a backtick.
- Fixed edits typed just before switching pages or opening Settings, Uploads, or Trash being lost.
- Adjusted the vertical alignment of task checkboxes and bullet markers.

## 0.1.17 — 2026-09-01

- Added an Uploads page for browsing, previewing, downloading, copying, renaming, and safely
removing workspace assets.
- Added Pinned items above the workspace tree. Pins are local to the browser and stay aligned when
an item is renamed, moved, or deleted.
- Expanded search with keyboard tab cycling and a Recent view of successfully opened workspace
documents.
- Unified item actions across the sidebar, breadcrumbs, and editor header, including consistent
copy, revision, pin, rename, move, and Trash actions where applicable.
- Added a complete dark appearance that follows the operating system by default and can be
overridden in Settings.
- Improved editing reliability: task markers no longer erase following content, and Tab or
Shift-Tab indents every eligible item in a multi-item selection as one undoable change.
- Refined link interaction feedback so actionable styling appears only for the hovered link while
an activation modifier is held.

## 0.1.16 — 2026-08-20

- Made internal links, external links, and mentions more predictable to edit and open, with better
path suggestions and stable behavior around selections and scrolling.
- Added safe SVG upload and paste support, including automatic reference repair when assets are
renamed, moved, deleted, or restored.
- Improved direct-link startup, sidebar keyboard menus, page creation, Trash fallback navigation,
code-fence creation, paste behavior, and block deletion stability.
- Refreshed the Rumi logo and visual system, and added a password visibility control to login.

## 0.1.15 — 2026-08-12

- Made multi-block selection reversible and easier to extend across contiguous and separated
ranges.
- Renamed the generic Text block to Paragraph and added familiar aliases such as `p`, `h2`, and
`heading 2` to block search.
- Improved copy and paste between Rumi, spreadsheets, and other editors, including URL paste and
replacement of complete inline-code spans.
- Added Copy URL and Copy relative path to page actions.
- Let modified New Page actions open the created page immediately with its default title selected.

## 0.1.14 — 2026-08-07

- Added a workspace startup preference for Home or the last visited page while keeping explicit
deep links authoritative.
- Restored page positions during browser Back and Forward navigation within the current session.
- Made startup feel more stable by showing safe cached workspace structure while fresh data loads.
- Rebalanced editor spacing so paragraphs breathe more and list rows remain compact.

## 0.1.13 — 2026-08-04

- Added Floating, Top, Bottom, and None editor-toolbar modes.
- Made formatting, task toggles, movement, duplication, undo, redo, and deletion work coherently across explicit multi-block selections.
- Made links editable like normal text while requiring deliberate, platform-aware actions to open
them.
- Added clear caret positions around non-text blocks such as dividers and database embeds.

## 0.1.12 — 2026-08-03

- Made multiline prose and soft breaks survive save, reopen, copy, and paste consistently.
- Improved interchange with spreadsheets and rich-text editors while preserving exact Rumi
structure when copying between Rumi pages.
- Made tables behave like ordinary document blocks for selection, copying, replacement, and
navigation.
- Improved code-block paste and collapsed-section exit behavior.

## 0.1.11 — 2026-07-30

- Added emoji suggestions and workspace controls for editor assistance.
- Improved code blocks, toggleable headings, block replacement, and keyboard shortcuts.
- Kept document-changing editor actions grouped into predictable undo steps.

## 0.1.10 — 2026-07-29

- Improved block selection and the block action menu, including keyboard-driven block-type search and replacement.

## 0.1.9 — 2026-07-28

- Added editor-native Settings and Trash pages with stable reserved routes.
- Added workspace controls for uploads and misspelling highlighting.
- Made deleted pages, folders, databases, records, and assets recoverable through workspace-local Trash.

## Foundation — 0.1.1 to 0.1.8

- Established the file-backed workspace model for pages, folders, databases, assets, search,
revision history, and recoverable deletion.
- Shipped the official web editor and the installable `rumi` server command.
- Added configurable database views, columns, filters, sorting, and property visibility shared by
full database pages and embedded views.
- Added optional password protection for hosted instances while keeping local workspaces usable
without a central Rumi account.

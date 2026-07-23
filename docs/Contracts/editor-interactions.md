---
status: accepted
area: editor
owner: web
created: "2026-07-18"
updated: "2026-07-23"
---
# Editor Interactions

The proven Rumi editor is the functional baseline for the official editor. Its ProseMirror schema,
commands, plugins, NodeViews, and interaction styling are migrated together so the editing model is
preserved. Browser/platform adapters replace its Electron and direct-filesystem calls; Markdown
remains the durable representation and workspace operations remain server-owned.

## Behavior Map

| User problem | Action | Expected result |
| --- | --- | --- |
| Navigate with browser history or share an open item | Open a page, folder, database, record, or Trash; use Back/Forward or load its URL directly | The address changes to a URL-safe workspace slug, Back/Forward restores the matching view, deep links survive refresh, and the persistent application layout does not remount. |
| Rename or split the open-page title without leaving the editor | Click the filename text or the unused part of its row, edit it, then blur or press Enter | Text clicks preserve the exact caret position; row clicks place it at the end. Blur renames, while Enter keeps the title before the caret and moves the remainder into a new first content block. Mod-Z reverses either operation as one action, restores the original title, and reopens it with the caret at the end. The extension stays hidden, pending edits save first, and Escape cancels. |
| Create structure without leaving the keyboard | Type Markdown prefixes or use `/` | Headings, lists, tasks, quotes, code, Mermaid, dividers, tables, bookmarks, database references, images, and files become semantic blocks. The slash menu follows the active line through native editor scrolling, prefers the space below it, flips above when needed, and scrolls internally when neither side can fit it in full. |
| Continue naturally around special blocks | Press Enter, Backspace/Delete, Shift-Enter, Tab, Shift-Tab, or Mod-Enter | Lists split/lift, a blank paragraph block is removed by Backspace or Delete when another block remains, separate paragraph blocks have a visible block gap while hard breaks remain compact and inline, code receives literal tabs or exits, tables move between cells, and dividers remain navigable. |
| Connect knowledge quickly | Type `@`, paste a URL over selected text, or edit a link | A Markdown link is inserted. Internal destinations are URI-decoded and resolved from the containing document or workspace root, then the matched node receives its current application slug; application slugs are never written over canonical file paths. Web links open externally. Link text and destination can be copied, edited, or removed. |
| Format selected text | Use the selection toolbar or keyboard shortcuts | Bold, italic, underline, strike, code, the single default yellow highlight, and links are applied as Markdown-backed marks. |
| Reorganize document structure | Use each block's handle, Command-D, modifiers, area selection, or drag | Command-D duplicates the explicit block selection, or the cursor's whole active block when there is no block selection; the duplicate becomes the active block selection. One or many blocks can also be deleted, reordered, and, for list items, indented or outdented. A top-level list drop crosses into its first indent after 30% of the editor width; a drop beneath an already-indented item aligns with that item until it crosses 20% of the target item's own width, then nests one level deeper. Every list item is independently addressable. Any click outside the editable block area clears both its block highlight and NodeSelection after the clicked control completes its own behavior. |
| Change a thought's role | Open the block menu and choose a type | The block converts among text, heading levels, bullet/number/task lists, quote, code, and divider while preserving useful text. |
| Focus on one section | Toggle a heading caret | Blocks and their external hover controls until the next equal-or-higher heading hide or reappear immediately, without a layout transition or residual rich-block box; Markdown is unchanged. |
| Work with tables | Put the cursor in a table or scroll an oversized table | Context controls add/delete rows and columns; Tab and Shift-Tab navigate cells. The table wrapper remains the width of the editor content column and oversized tables scroll inside it on both axes. |
| Browse database table views | Open a database page or an embedded database table | Full-page and embedded databases use one shared database component; its embed variation only adds the source link/dropdown. Tabs occupy the same transparent toolbar row as search/filter/source/new controls, with embedded source between Filter and New. The fixed 48-pixel toolbar uses 4-pixel vertical padding around a 40-pixel content band that centers every tab and control on one Y-axis, followed by an additional 6-pixel gap before the heading. Multiple table views retain independent nested filters, sorts, and exact visible columns. Views appear as 40-pixel independent pills: the active pill is filled and uses stronger text, while inactive pills have a neutral outline. Search, Filter, New, and the borderless Add View control retain their compact button sizes and remain centered; Add View is transparent until hover gives it a neutral fill. Pills do not overlap or join the table border. The white table heading uses only top and bottom rules. Compact, borderless bulk-selection checkboxes appear instantly on the block-handle axis outside the table surface, remain fixed during horizontal scrolling, and stay interactive inside embeds. A measured sibling overlay gives each checkbox a transparent hover target spanning the full height of its real header or row and the full gutter width to the table edge; the table contains no checkbox cells or anchors, so its normal-width scroll frame remains exactly constrained to the container. Tables use the editor content width and scroll oversized rows or columns inside a shared two-axis frame. Cell values wrap by default. Record names become plain inline editors with no focus border, background change, row-height shift, or text-baseline movement, and the caret starts at the end. Full-height header dividers appear only on header hover/focus to identify resizable boundaries; widths are browser-local preferences scoped to the workspace, database, and stable view ID rather than shared schema data. Table search expands immediately to a 224-pixel solid-white surface that fills the content band, so its inactive-pill-colored bottom rule exactly aligns with the pill bottoms. A separate preceding 44-pixel gradient runs from zero opacity through 50% white at 30% of its width to fully opaque white, making pill overlap fade earlier and more clearly. Bulk mode reuses that white band and fade, with every label sharing the toolbar's vertical center. The selection count becomes a blue-600 underlined `Clear all` action on hover/focus. Embedded bulk mode omits the database source selector. Escape closes and clears search and clears bulk selection, including both latent states when selection has hidden an open search. The frame has no outer border, top/bottom section separators, final-row bottom rule, or manual Refresh control; loading remains application-owned. |
| Filter database records | Activate the filter icon beside New on a database page or embed, build the rules, and select Apply | An anchored filter builder restricts conditions and values to the selected property type, offers searchable select-option values, and supports nested groups with isolated `and`/`or` logic. All edits remain local until Apply saves the complete tree to the active `.db.md` view for runtime evaluation. |
| Control database property visibility | Use a table column header context menu or an individual record page's properties menu | A column can be hidden and hidden columns can be restored only through table header actions; there is no toolbar visibility control. Table columns are shown or hidden only in the active view. Record-page properties use independent database-level record-page settings. Neither action deletes schema or frontmatter values. |
| Create a property | Activate a table or page property-create trigger, type a name, choose a type, and confirm | An anchored shared menu uses its search field as the exact name and type-ahead hint, displays types as an icon grid, supports arrow navigation, defaults to Text, moves focus to Date for a prefix such as `Dat`, confirms type on the first Enter, and creates on the second Enter. |
| Read and reuse code | Use a code block toolbar | The language is stored in the fence and selected through a searchable styled menu rather than a native browser selector, source can be copied, and Mermaid offers code/split/preview modes loaded only when needed. |
| Reuse workspace assets | Insert, paste, or drop an image/PDF | The client uploads bytes through the API; the runtime chooses a collision-safe `.assets/` path and emits `asset.changed`; Markdown stores only the relative path. |
| See linked resources at block level | Use standalone URLs, `![[file]]`, images, or `db` fences | The editor renders bookmark, file, image, and database-reference NodeViews while round-tripping the original Markdown syntax. |

## Migration Boundaries

- List items temporarily retain the proven editor's flat `indent` attribute model. This preserves
  per-item handles and the established drag behavior: vertical position chooses a block gap, while
  moving right chooses an allowed indent. Serialization still produces nested Markdown lists.
- Handles use one fixed editor-gutter X-axis even when list content is indented. The editor and the
  gutter to its left both activate the corresponding block handle.
- Heading collapse mode and Mermaid view mode are presentation state, not document data.
- The editor does not call filesystem or Electron APIs. Workspace assets go through runtime/API
  commands, so other clients can implement the same behavior.
- Automated platform-boundary coverage rejects Electron package imports, preload/IPC bridge APIs,
  legacy renderer imports, and Electron runtime dependencies from the active apps and packages.
- Bookmark metadata fetching is not required for a bookmark to work. The durable value is the URL.
- Mermaid uses the regular Phosphor Flow Arrow icon in the canonical block-type presentation shared
  by the handle context menu and slash menu.
- Database embeds remain references to database sources. Database relations are deliberately not
  implemented by this contract; Decision 019 remains the separate schema decision.
- A database embed may persist its selected stable view ID in the existing `db` fence. Saved view
  configuration still belongs only to the source database's `.db.md` file.

## Persistence Boundary

Every document-changing action updates ProseMirror first. Serialization is deferred from the
keystroke path and the client requests the current draft for autosave. Markdown/frontmatter remain
canonical, while selection, open menus, collapsed headings, and Mermaid display mode remain client
state.

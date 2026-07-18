---
status: accepted
area: editor
owner: web
created: "2026-07-18"
updated: "2026-07-18"
---
# Editor Interactions

The proven Rumi editor is the functional baseline for the official editor. Its ProseMirror schema,
commands, plugins, NodeViews, and interaction styling are migrated together so the editing model is
preserved. Browser/platform adapters replace its Electron and direct-filesystem calls; Markdown
remains the durable representation and workspace operations remain server-owned.

## Behavior Map

| User problem | Action | Expected result |
| --- | --- | --- |
| Create structure without leaving the keyboard | Type Markdown prefixes or use `/` | Headings, lists, tasks, quotes, code, Mermaid, dividers, tables, bookmarks, database references, images, and files become semantic blocks. |
| Continue naturally around special blocks | Press Enter, Shift-Enter, Tab, Shift-Tab, or Mod-Enter | Lists split/lift, hard breaks remain inline, code receives literal tabs or exits, tables move between cells, and dividers remain navigable. |
| Connect knowledge quickly | Type `@`, paste a URL over selected text, or edit a link | A Markdown link is inserted. Internal links open through the client adapter; web links open externally. Link text and destination can be copied, edited, or removed. |
| Format selected text | Use the selection toolbar or keyboard shortcuts | Bold, italic, underline, strike, code, named highlight colors, and links are applied as Markdown-backed marks. |
| Reorganize document structure | Use each block's handle, modifiers, area selection, or drag | One or many blocks can be selected, duplicated, deleted, reordered, and, for list items, indented or outdented. Every list item is independently addressable. |
| Change a thought's role | Open the block menu and choose a type | The block converts among text, heading levels, bullet/number/task lists, quote, code, and divider while preserving useful text. |
| Focus on one section | Toggle a heading caret | Blocks until the next equal-or-higher heading are hidden as client UI state; Markdown is unchanged. |
| Work with tables | Put the cursor in a table | Context controls add/delete rows and columns; Tab and Shift-Tab navigate cells. |
| Read and reuse code | Use a code block toolbar | The language is stored in the fence, source can be copied, and Mermaid offers code/split/preview modes loaded only when needed. |
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
- Bookmark metadata fetching is not required for a bookmark to work. The durable value is the URL.
- Database embeds remain references to database sources. Database relations are deliberately not
  implemented by this contract; Decision 019 remains the separate schema decision.

## Persistence Boundary

Every document-changing action updates ProseMirror first. Serialization is deferred from the
keystroke path and the client requests the current draft for autosave. Markdown/frontmatter remain
canonical, while selection, open menus, collapsed headings, and Mermaid display mode remain client
state.

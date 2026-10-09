## Next release

- [x] [images links failed](Tasks/M07-046-image-paths-with-spaces.md): filenames on load created as `image (23).png`, but at some point insted of images i see only `.png)` - prob some replacement roles took place.
    - [x] regarding images, investigate the possibility to pass the original filename on image paste
- [x] [when dragging parent list item, childs should move with it as a whole](Tasks/M07-047-drag-list-item-with-children.md)
- [x] [preserve heading toggle state](Tasks/M07-048-remember-heading-collapse.md) - investigate if the editor can persist the last state of a heading 1..3 for the user, not conflicting with the file-first approach (no source file edits)

## Backlog

- [ ] add table of contents (in-source or front end only?)
- [ ] on internal link hover, show page preview: title, props, content excerpt
- [ ] Slash command on mobile
- [ ] Mobile editor header
- [ ] Mobile zoom-in on focus (editor, login)
- [ ] Block dnd and context actions on mobile
- [ ] Support links to page headings via `#heading` anchors
- [ ] drag-n-drop block into db:
    - [ ] into page - append to it
    - [ ] between rows - create new item
- [ ] `Cmd+F` already works as browser-native feature, let's keep that. But on `Cmd+Shift+F` i want to toggle the find-and-replace modal. good reference is how sublime text working in this regard. It should support regex and normal replacements, buttons to jump between occurences, replace next, replace all. this operation should be stored in the file's operations history to undo on Cmd+Z like any other change.
- [ ] [Inline-code caret boundary](Tasks/xxx-inline-code-caret-boundary.md)
- [ ] shortcut to delecte text cursor __block__ - currently `cmd+a` then `delete` (should i tho?)
- [ ] sidebar database props visibility, sort, filter:
    - [ ] selector for property (-ies?) to display as labels next to text
    - [ ] sort/filter items in sidebar by prop
    - [ ] limit items loading
    - [ ] current item in sidebar when touching parent make them static; instead i want the child item become sticky with parent so it's always visible if off-viewport

## To think

- Global tags
- Workspace groups: combine nested Rumi workspaces through their parent while keeping each independently served
- Blocks identations and grouping:
    - paragraph, quote, code, heading etc - group under parent block
        - probably just lines starting with `<tab>` in source file are treated as child blocks
        - list items prob should be the child of whole list block but idk it's kinda hard
- 2D and 3D databases:
    - now we have 3D databases - they have props and content
    - 2D databases are like google sheets
        - pivot table could be a special kind of a base
    - alternatively consider another structure for 3D databases - md content can live inside prop. kinda like Notion i think - more structured but less file-first and compatible with Obsidian

## Archive

- [x] [update app in settings](Tasks/M07-039-app-update-check-and-install.md) - when current ≠ latest npm, show indicator near `settings` in sidebar. add new item with version and update button if available
- [x] [page/db/folder and workspace icon picker](Tasks/M07-040-workspace-item-icons.md): emojis, phosphor icons and custom uploaded icons
    - [x]  the icon picker opens with noticable delay
- [x] [instead of "authentification required" toast (or similar), show login screen](Tasks/M07-041-session-expiry-login-overlay.md). currently it's blocking edits save (which should remain), but on top of it should be login screen (with redirect to active page if was active at the moment of token expire)
- [x] [any paste action (mouse/shortcut) should not break the sequence for \`\` inline code formatting](Tasks/M07-042-inline-code-input-survives-paste.md)
- [x] [blank lines (or multiple bank lines in a row) are removed on page reload - they should preserve](Tasks/M07-043-preserve-blank-lines.md)
- [x] [offset checkbox icon for list item lower 4px, and the list item - 4 px higher](Tasks/M07-044-list-marker-alignment.md)
- [x] [edits typed right before leaving a page are lost](Tasks/M07-045-save-before-leaving-page.md) (found during QA, also on 0.1.17)
- [x] Initial deep links open the requested route instead of showing a transient not-found state.
- [x] [Breadcrumb context actions](Tasks/M07-036-shared-breadcrumb-context-actions.md) use the same
actions as the sidebar, including Copy URL and Copy relative path.
- [x] [Pinned pages, folders, and databases](Tasks/M07-038-pinned-workspace-items.md) appear above
the main workspace tree and follow rename, move, and deletion changes.
- [x] [Uploads library](Tasks/M07-034-media-library.md) provides one place to browse, preview,
download, copy, rename, and move uploaded files to Trash.
- [x] [Search tabs cycle with Tab and Shift-Tab](Tasks/M07-032-search-tabs-and-recents.md), including
a Recent tab for recently opened workspace documents.
- [x] [Task markers typed before existing content preserve that content](Tasks/M07-033-task-marker-content-preservation.md).
- [x] [Tab and Shift-Tab apply to every eligible item in a multi-line or block selection](Tasks/M07-035-multi-selection-tab-indentation.md).
- [x] Text carrying both link and inline-code formatting uses the inline-code color.
- [x] cmd+block selector to select several areas (like 3+2+4 with non-selected blocks in-between)
- [x] rename change/create block from text to paragraph; add friendly names for block for create/change (e.g. h2, heading 2 will both focus on heading 2)
- [x] add "Create page" for sidebar context menu for folders and databases
- [x] cmd+click/enter on create page (from sidebar or folder/db), also from database view (only cmd+click) should create and open a newly created page with default name highlighted in title rename, so on keydown name changes to whatever input there is
- [x] copy url and relative path: hotkey and wire up ui
- [x] URL paste:
    - [x] Cmd+V on highlighted text - text becomes anchor to url/domain from buffer
    - [x] Cmd+V on text cursor - inline url/domain with buffer contents same for link anchor and url
    - [x] Shift+Cmd+V - replaces highlighted text or pastes buffer as plain text

> for links it's important to understand that buffer contains url: either contains http/https, www., or generic domain format domain.tld, sub.domain.tld, domain.com.tld etc.

- [x] changing lists with identation to other list type resets ident - they need to be preserved
- [x] paragraphs are pasted to google sheets with blank lines in-between, but lists are pasted just fine - fix paragraphs pls
- [x] cmd+click on block handle should toggle block selection state (now it's just toggling on but not off)
- [x] when shift+down on selected block, it adds next block to selection (which is correct). but on shift+up, it should remove selection of a block selected previously, and if only one block left in selection it should add block above (and vice versa).
- [x] inline code
    - [x] cmd+v onto fully highlighted inline code makes it plain text - it should preserve the formatting
- [x] update logo with following image (rumi.md and app)

![](.assets/light.svg)

- [x] \`\`\` does not creates a code block
- [x] open external links in new tab by default, internal - same tab
- [x] add .svg uploads support
- [x] when pasting svg code outside the code block/inline code, i want it to paste as file - prob create a file from code and link to it as other assets. on shift+cmd+v it should paste as text anywhere
- [x] make sure on uploads/assets rename docs have proper links
- [x] sidebar context menu: focus on first item, navigate with arrows, confirm on enter
- [x] after moving current page to trash, navigate to previous page instead of home (check if issue exists, could be for db-pages only)
- [x] cold visit inner url should always open this url regardless of what should be opened on start
- [x] improve link behaviour
    - [x] highlight → remove link makes viewport jump down, it should remain
- [x] dark theme

## &#32;- In progress

## Planned

- [ ] context actions on items from breadcrumbs (rmb)
    - [ ] include copy path and copy url to context actions. these context actions should be synced with sidebar and breadcrumbs - basically the same component and actions
- [x] update logo with following image (rumi.md and app)

![](.assets/light.svg)

- [x] \`\`\` does not creates a code block
- [ ] add favorite pages/folders/dbs
- [ ] dark theme
- [x] open external links in new tab by default, internal - same tab
- [x] add .svg uploads support
- [x] when pasting svg code outside the code block/inline code, i want it to paste as file - prob create a file from code and link to it as other assets. on shift+cmd+v it should paste as text anywhere
- [x] make sure on uploads/assets rename docs have proper links
- [x] sidebar context menu: focus on first item, navigate with arrows, confirm on enter
- [x] after moving current page to trash, navigate to previous page instead of home (check if issue exists, could be for db-pages only)
- [ ] drag-n-drop block into db:
    - [ ] into page - append to it
    - [ ] between rows - create new item
- [ ] `Cmd+F` already works as browser-native feature, let's keep that. But on `Cmd+Shift+F` i want to toggle the find-and-replace modal. good reference is how sublime text working in this regard. It should support regex and normal replacements, buttons to jump between occurences, replace next, replace all. this operation should be stored in the file's operations history to undo on Cmd+Z like any other change.
- [ ] [Inline-code caret boundary](Tasks/xxx-inline-code-caret-boundary.md)
- [x] cold visit inner url should always open this url regardless of what should be opened on start
- [x] improve link behaviour
    - [x] highlight → remove link makes viewport jump down, it should remain
- [ ] media library - similarly to trash and settings add a page, where users can browse, delete, copy etc. uploaded files

## To think

- Global tags
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
> 
- [x] changing lists with identation to other list type resets ident - they need to be preserved
- [x] paragraphs are pasted to google sheets with blank lines in-between, but lists are pasted just fine - fix paragraphs pls
- [x] cmd+click on block handle should toggle block selection state (now it's just toggling on but not off)
- [x] when shift+down on selected block, it adds next block to selection (which is correct). but on shift+up, it should remove selection of a block selected previously, and if only one block left in selection it should add block above (and vice versa).
- [x] inline code
    - [x] cmd+v onto fully highlighted inline code makes it plain text - it should preserve the formatting

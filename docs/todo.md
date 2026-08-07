## Planned

- cmd+block selector to select several areas (like 3+2+4 with non-selected blocks in-between)
- rename change/create block from text to paragraph; add friendly names for block for create/change (e.g. h2, heading 2 will both focus on heading 2)
- add "Create page" for sidebar context menu for folders and databases
- copy url and relative path: hotkey and wire up ui
- drag-n-drop block into db:
    - into page - append to it
    - between rows - create new item
- `Cmd+F` already works as browser-native feature, let's keep that. But on `Cmd+Shift+F` i want to toggle the find-and-replace modal. good reference is how sublime text working in this regard. It should support regex and normal replacements, buttons to jump between occurences, replace next, replace all. this operation should be stored in the file's operations history to undo on Cmd+Z like any other change.
- paragraphs are pasted to google sheets with blank lines in-between, but lists are pasted just fine - fix paragraphs pls
- cmd+click on block handle should toggle block selection state (now it's just toggling on but not off)
- when shift+down on selected block, it adds next block to selection (which is correct). but on shift+up, it should remove selection of a block selected previously, and if only one block left in selection it should add block above (and vice versa).
- inline code
    - cmd+v onto fully highlighted inline code makes it plain text - it should preserve the formatting
- i type something inside \`\`, and when inline text is closed, cursor should be placed outside of the inline code. to explicitly enter the space inside inline, user press left arrow and cursor is placed inside the inline code. right arrow - cursor out
- URL paste:
    - Cmd+V on highlighted text - text becomes anchor to url/domain from buffer
    - Cmd+V on text cursor - inline url/domain with buffer contents same for link anchor and url
    - Shift+Cmd+V - replaces highlighted text or pastes buffer as plain text

> for links it's important to understand that buffer contains url: either contains http/https, [www](http://www)., or generic domain format domain.tld, sub.domain.tld, domain.com.tld etc.
>

## To think

- Global tags
- Blocks identations and grouping:
    - paragraph, quote, code, heading etc - group under parent block
        - probably just lines starting with `<tab>` in source file are treated as child blocks
        - list items prob should be the child of whole list block but idk it's kinda hard

## Archive


www.

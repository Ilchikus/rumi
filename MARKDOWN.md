# Markdown syntax

Rumi uses [GitHub Flavored Markdown (GFM)](https://github.github.com/gfm/) as its primary
Markdown flavor. Standard GFM syntax is the portability baseline for headings, emphasis,
strikethrough, links, images, blockquotes, lists, task lists, tables, code, and thematic breaks.

Rumi keeps Markdown files as the source of truth. Editor-only state, such as the cursor position,
selection, and collapsed headings, is not written to them.

Strikethrough uses the GFM double-tilde form: `~~struck through~~`.

## Rumi extensions

### Highlight

Use double equals signs to highlight inline text:

```markdown
This is ==highlighted text==.
```

The web editor renders the highlighted text as the semantic HTML element
`<mark>highlighted text</mark>` and saves it as `==highlighted text==`.

Highlight syntax is ignored inside inline code, fenced code blocks, and indented code blocks.

### Underline

Use double underscores for underline:

```markdown
This is __underlined text__.
```

Rumi renders this as `<u>underlined text</u>`. This deliberately differs from GFM, where double
underscores represent strong emphasis. Use `**bold text**` for portable bold text.

### Task items

Rumi reads the standard GFM task markers and its compact unchecked form:

```markdown
- [ ] Standard GFM unchecked task
- [] Compact Rumi unchecked task
- [x] Checked task
```

When saving, Rumi writes portable GFM task markers: `- [ ]` for unchecked tasks and `- [x]` for
checked tasks. The compact unchecked form remains readable at every nesting depth for compatibility
with existing Rumi files.

In the web editor, typing `[]`, `[x]`, `- []`, `- [x]`, `-[]`, or `-[x]` at the beginning of a
line creates a task item after the following Space is typed. The standard `- [ ]` form is accepted
too.

### File and database embeds

Rumi supports an Obsidian-style file embed on its own line:

```markdown
![[.assets/spec-sheet.pdf]]
```

Database views use a fenced `db` block:

````markdown
```db
source: Tasks
view: table
```
````

These blocks remain readable plain text outside Rumi, but their interactive rendering is
Rumi-specific. Mermaid diagrams use ordinary fenced code blocks with the `mermaid` language.

## Read-time compatibility

Workspace link destinations containing spaces are accepted without angle brackets and are saved in
portable GFM form, for example `[Notes](<Project notes/index.md>)`.

Custom inline syntax is not interpreted inside code.

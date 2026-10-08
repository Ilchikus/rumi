---
status: verify
type: feature
milestone: M07
release: "0.1.18"
owner_layer: markdown
coverage:
  - markdown
created: "2026-10-05"
updated: "2026-10-05"
---
# M07-043 Preserve Blank Lines Between Blocks

## Goal

Empty paragraphs typed between blocks survive save and reload, with a file representation people
can read.

## Current Behavior

`serializeMarkdown` writes each empty paragraph as two extra newlines, but `parseMarkdown` discards
all blank lines between blocks. Empties vanish on reload and are then dropped from the file on the
next save.

## Rule

There is one normal separator between blocks: one blank line, or none between consecutive list
items. Each additional blank line is one empty paragraph, in both directions.

```text
A            A
             (empty)
             (empty)
             B
B
```

## Scope

- Serializer: an empty paragraph adds one blank line to the separator before the next block
  instead of emitting its own line pair.
- Parser: use mdast positions to count the blank lines between consecutive top-level blocks and
  between flattened list items. Each item's gap is measured from its own content's end line, not
  its nested children. Insert `max(0, blankLines − 1)` empty paragraphs.
- Externally written loose lists, with one blank line between items, keep rendering without empties.
- Leading blank lines in the body (common right after frontmatter) and trailing blank lines are not
  converted. Files keep ending with exactly one newline.
- An empty paragraph does not end a numbered list. The file and the editor number items with one
  shared function (`numberedItemNumbers`), so the editor shows "2." after a blank line too.

## Out Of Scope

- Blank lines inside blockquotes, tables, or code blocks (code is already literal).
- Preserving empty paragraphs at the very start or end of a document.

## Owner Layer

markdown (live editor serializer in `apps/web/src/components/editor/migrated/markdown.ts`)

## Required Coverage

- [ ] Roundtrip tests: one or more empties between paragraphs, after a heading, between list items,
      list to paragraph, and paragraph to list. Also cover nested lists, an unchanged loose list,
      leading and trailing trimming, and that existing soft-break and hard-break tests are
      unchanged.
- [ ] Clipboard serialization tests still pass.

## Implementation Notes

Pages saved by 0.1.17 or earlier with empty paragraphs, and not re-saved since, show twice as many
empty lines once. That is acceptable because those empties were already invisible after reload.

## Done When

Any sequence of empty paragraphs between blocks reloads identically, and `parse(serialize(doc))`
is stable for the test corpus.

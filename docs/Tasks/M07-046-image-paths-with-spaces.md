---
status: verify
type: bug
milestone: M07
release: "0.1.19"
owner_layer: markdown
coverage:
  - unit
  - ui-smoke
created: 2026-10-09
updated: 2026-10-09
---
# M07-046 Image Paths With Spaces

## Goal

Images whose file name contains a space, such as the collision name `.assets/image (23).png`, keep
working after reload. Today the editor writes `![](.assets/image (23).png)`, which Markdown reads as
an image of `.assets/image` titled "23" followed by the text `.png)`. The editor then shows `.png)`
and the next save writes only `.png)`, losing the image reference.

## Scope

- Editor serializer: image destinations with whitespace are written as `<...>`, like links already
  are: `![](<.assets/image (23).png>)`.
- Editor parser: repair the broken form Rumi wrote before this fix. A `![alt](.assets/… .ext)`
  destination that contains whitespace and ends in a file extension is read as one path, outside
  code blocks and inline code.
- Server reference rewriting (asset rename and move): understand `<...>` destinations, so renaming
  an asset with a space in its name updates its links.
- Investigation, image paste names: the browser passes the real name for copied and dropped files;
  clipboard bitmaps (screenshots, "Copy image") arrive as `image.png` with no original name. When a
  copied web image's HTML names a file, use that name.

## Out Of Scope

- Renaming existing assets or changing the `name (N).ext` collision scheme.

## Required Coverage

- [x] Roundtrip: image path with spaces and parentheses serializes with `<...>` and reparses.
- [x] The legacy broken form parses to the full path; the same text inside code stays literal.
- [x] Asset rename rewrites `<...>` image destinations.
- [x] Paste naming from copied web image HTML.

## Done When

A page with `image (23).png` reloads with the image visible and saves it back intact, and pages
already saved in the broken form show their images again.

---
status: done
type: foundation
milestone: M01
owner_layer: runtime
coverage:
  - runtime
  - markdown
created: "2026-06-22"
updated: "2026-06-22"
---
# M01-003 Read Tree And Open Page

## Goal

Implement core read commands.

## Scope

- `getTree`.
- `openPage`.
- Frontmatter/body split.
- Content hash and version/hash response.
- Hide internal `.rumi/` from tree.

## Required Coverage

- [x] Runtime test reads nested tree.
- [x] Runtime test hides internal files.
- [x] Runtime test opens page with frontmatter and body.
- [x] Markdown test handles files with no frontmatter.

## Done When

- API and web layers can rely on runtime read commands.

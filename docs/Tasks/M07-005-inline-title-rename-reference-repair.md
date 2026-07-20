---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - markdown
  - runtime
  - ui-smoke
  - docs
created: 2026-07-20
updated: 2026-07-20
---
# M07-005 Inline Title Rename And Reference Repair

## Goal

Rename an ordinary page directly from its extensionless title without interrupting editing, while
keeping workspace references, revisions, and search data consistent.

## Delivered

- Click-to-edit page title with no focus decoration; blur commits and Escape cancels.
- Clicking unused space on the title row edits at the end; Enter splits at the caret into the
  filename and a new first content block.
- Mod-Z treats a completed rename or title/content split as one reversible action and returns focus
  to the restored title at its end.
- Immediate optimistic title feedback while the filesystem command runs.
- Save/rename coordination so an in-flight or dirty editor is saved before the path changes.
- Background repair for Markdown links, generated mentions, Wikilinks, YAML strings, HTML links,
  reference definitions, nested paths, folder descendants, and folder/database companions.
- Encoded and relative Markdown destinations resolve against canonical workspace paths before the
  browser generates the matched node's current URL slug, so folder renames do not make links inert.
- Custom labels, aliases, external links, inline code, and fenced examples remain untouched.
- Before-repair revision checkpoints, refreshed SQLite search entries, and typed repair events.
- Dirty open pages merge repair events into their local draft instead of entering false conflict.

## Coverage

- [x] Markdown unit coverage for supported references, relative paths, and protected code/external links.
- [x] Runtime integration coverage for background writes, events, indexes, and concurrently moved pages.
- [x] Static UI coverage for the extensionless title and focus-free rename affordance.
- [x] Typecheck and production web build.
- [ ] Manual browser smoke test for click, blur, optimistic feedback, failure rollback, and sidebar refresh.

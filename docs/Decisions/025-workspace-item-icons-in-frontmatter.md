---
status: accepted
areas:
  - files
  - runtime
  - web
impact: medium
created: "2026-10-05"
updated: "2026-10-06"
---
# Workspace Item Icons Live In Frontmatter

## Decision

Pages, database records, folders, databases, and the workspace use one optional frontmatter key,
`icon`, in the file that already represents them:

- Page or record: its own Markdown file.
- Folder: `<Folder>.index.md`, created on demand.
- Database: `<Database>.db.md`.
- Workspace: the root index page, created on demand.

The value is a single string in one of three forms:

```yaml
icon: "🚀"                   # one emoji
icon: ph:rocket-launch       # Phosphor icon, regular weight
icon: ph:rocket-launch:blue  # Phosphor icon in a palette color
icon: .assets/team-logo.png  # uploaded workspace asset
```

A Phosphor icon may carry one color from Tailwind's 500 shades, with `neutral` as the only gray:
red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple,
fuchsia, pink, or rose. Neutral is the default and is not written, so `ph:<name>` keeps the
surrounding text color. An unknown color draws the icon uncolored. Emoji and uploaded images have
no color.

An absent, empty, or unrecognized value renders the default kind icon and is never rewritten by
Rumi. `icon` is a reserved key. The Properties panel does not show it as an ordinary property, and
database schemas cannot define a property with that name.

## Why

An icon is part of a document's identity in the way its title is, not a per-occurrence layout detail
like image width ([024](024-hidden-shared-page-presentation.md)). Keeping it in the file means it
moves, copies, and syncs with the document, needs no path repair when the document itself moves,
and can be set by hand, by agents, or by other Markdown tools without the Rumi runtime.

## Consequences

- A custom icon replaces the item's page, folder, or database kind icon in every place the item is
  shown. The two are never shown together. In page text, only `@` mentions take the custom icon;
  other internal links keep the kind glyph (user direction, 2026-10-06).
- Workspace tree nodes expose the resolved `icon`, taken from the in-memory index frontmatter, so
  every client surface renders from one source without extra reads.
- When a document's `icon` changes, the runtime emits a tree change, whether the change came from
  a save, a record-property update, or an external edit reconciled by the watcher.
- Asset reference repair covers `icon` values that point to uploaded assets.
- A colored Phosphor icon keeps its color everywhere it replaces a kind icon, including link
  markers and the favicon. The picker starts from the last color chosen in that browser, stored in
  local storage, not in the workspace (user direction, 2026-10-06).

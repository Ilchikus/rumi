---
status: verify
type: feature
milestone: M07
release: "0.1.18"
owner_layer: web
coverage:
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-10-05"
updated: "2026-10-05"
---
# M07-040 Workspace Item Icons

## Goal

Let pages, records, folders, databases, and the workspace carry an emoji, Phosphor, or uploaded
icon, stored in frontmatter `icon` ([025](../Decisions/025-workspace-item-icons-in-frontmatter.md)),
and render it everywhere the item appears.

## Scope

- Runtime:
  - Add `icon?: string` to `WorkspaceNode` tree nodes from the index frontmatter of the page,
    companion, or root index.
  - Emit `workspace.treeChanged` when an indexed document's `icon` changes, whether from a save, a
    record-property update, or watcher reconcile.
  - Setting an icon on a folder or workspace without a companion creates the companion.
  - Asset rename, move, trash, and restore repair `icon` values pointing at the asset, using the
    same rules as image references.
  - Reject `icon` as a database property name.
- Replacement rule: wherever Rumi shows an item with its page, folder, or database kind icon, a
  custom icon takes that same slot. The two never appear together. Items without a custom icon keep
  their kind icon unchanged.
- Web rendering: one `WorkspaceIcon` component and one tree-derived `path → icon` map, applied to
  every place that currently renders a kind icon for an item:
  - The sidebar tree and pinned rows. Folder open and closed states collapse into the custom icon.
  - Breadcrumbs.
  - Search results and the Recent tab.
  - Database table title cells and embedded views.
  - @mentions in the editor. The custom icon replaces the glyph in the existing `rumi-link-icon`
    slot. Other internal links keep the kind glyph (decided 2026-10-06). A Phosphor icon keeps the link-color mask; an emoji or upload renders
    as itself at the same size. The icon is resolved at render time through a node view, so the
    Markdown is unchanged.
  - The @-mention and link-path suggestion lists.
- Page header: a large custom icon above the title. When there is none, only an "Add icon"
  control appears on hover; no kind icon is added there.
- Workspace icon: replaces the Rumi logo in the sidebar header and becomes the browser-tab favicon.
  Emoji and Phosphor icons render as SVG data URLs.
- Picker: a popover with Emoji, Icons, and Upload tabs, plus Remove.
  - Emoji reuses `EmojiPicker`.
  - Icons is a searchable grid of Phosphor regular icons in `currentColor`.
  - Upload goes through the existing asset upload, respects the workspace type and size settings,
    and accepts images only.
  - The picker opens from the page-header icon and from a new "Icon…" entry in the shared
    workspace-item menu used by the sidebar, breadcrumbs, and header.
- Phosphor catalog:
  - `scripts/generate-phosphor-catalog.mjs` reads `@phosphor-icons/core` (a new devDependency) and
    writes a generated JSON file with name, tags, and regular SVG body. It works like the emoji
    catalog script.
  - The JSON loads as one lazy chunk, only when the picker opens or a `ph:` icon is visible.
- Properties panel hides `icon` on pages and records.

## Out Of Scope

- Icon colors, weights other than regular, and per-surface sizes beyond the existing row and header
  sizes.
- Icons for system pages, Trash items, Uploads, or generic files.
- Bulk icon assignment or database-level default icons for records.

## Owner Layer

web (runtime support listed above)

## Required Coverage

- [ ] Runtime tests for tree icons from a page, folder companion, database companion, and root
      index; companion creation; tree change on icon edits, including the watcher path; asset
      repair of `icon`; and the reserved property name.
- [ ] API test proving the tree response carries `icon`.
- [ ] Unit tests for icon value parsing (emoji, `ph:`, asset path, invalid) and favicon data-URL
      generation.
- [ ] UI smoke for setting and removing each icon type from the header and the item menu, with the
      sidebar, breadcrumbs, search, links, and mentions updating. Each surface shows the custom
      icon in place of the kind icon, never both, and shows the kind icon again after removal.
      Also cover Properties hiding `icon` and the Phosphor chunk staying unloaded until needed.
- [ ] Update the file-format and api-shape contracts, MARKDOWN.md, and the README feature list.

## Implementation Notes

Resolve icons only from the tree map so every surface stays consistent and no surface reads
frontmatter itself. The editor gets the map through plugin state, updated by a meta transaction
when the tree changes. This is the largest 0.1.18 item. If the release has to be cut, the
in-editor link and mention rendering can move to a follow-up without changing the storage model.

## Done When

An icon chosen in the browser is visible in every listed surface, survives reload, is readable in
the Markdown file, and an icon set by editing the file externally appears without a reload.

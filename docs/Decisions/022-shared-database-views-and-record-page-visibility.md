---
status: accepted
areas:
  - database
  - files
  - web
  - editor
impact: high
created: 2026-07-23
updated: 2026-07-23
---
# Shared Database Views And Record-Page Visibility

## Decision

Database views are named, shared configurations stored in the database's canonical `.db.md`
frontmatter. Full database pages and database embeds render the same view definitions and edit the
same saved filters, sorts, and visible columns.

Each view has a stable database-local `id` in addition to its display name and type. The ID lets two
views use the same type, keeps browser preferences and embedded-view selection stable across a view
rename, and does not add IDs to database records or ordinary Markdown pages.

View filters form a recursive tree. Every level chooses `and` or `or`; a nested group evaluates as
one condition in its parent group.

Table-view property visibility and database-record page visibility are separate concerns:

- `view.columns` is the exact ordered list of schema properties visible in that table view.
- `recordPage.hiddenProperties` is a database-level list of schema properties hidden when an
  individual record is opened.
- Hiding a property in either place never deletes its schema definition or record values.

## Why

A database can legitimately need several table views with different columns and filters. Treating
the view type as identity cannot represent that, and keeping active filters only in React state
makes full-page and embedded presentations disagree.

Record pages solve a different presentation problem from tables. A compact table may hide a long
notes field that should remain visible on the record page, while an internal field may be useful in
one operational table but distracting on every record page. Coupling those settings would make one
surface unexpectedly change another.

Using a hidden list for record pages makes the safe default explicit: existing and newly created
schema properties remain visible unless a user deliberately hides them. Unknown record
frontmatter also remains visible so externally authored data is not silently concealed.

## Consequences

- New databases and newly created views receive stable, readable IDs; legacy views without IDs are
  assigned collision-safe IDs when the configuration is next changed.
- A full database page keeps its selected tab as client navigation state.
- A database embed may store a view ID in its `db` fence so separate embeds can open on different
  views; a missing or stale ID falls back to the first supported view.
- View mutations use versioned runtime commands. The official client does not rewrite `.db.md`
  directly.
- Property rename, delete, and select-option rename/delete commands repair nested filters,
  per-view columns and sorts, and `recordPage.hiddenProperties`.
- Unknown future property and view definitions are preserved when supported configuration is
  changed.
- The first implementation supports table views only, but multiple table views are first-class.
  Other view types remain out of scope until separately designed.

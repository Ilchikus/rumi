---
status: accepted
areas:
  - database
  - files
  - index
  - editor
impact: high
created: "2026-07-18"
updated: "2026-07-20"
---
# Links Before Database Relations

## Proposal

Treat ordinary internal links and database relations as different product concepts that share one
portable reference format and one server-owned resolver.

An ordinary link can point to any workspace page from body Markdown or YAML properties. It should
participate in autocomplete, navigation, backlinks, search, and Rumi-controlled move repair without
requiring a database schema.

A future database `relation` property should be a typed link. Its schema adds a target database,
cardinality, relation-aware filtering, and later rollups. The record value should still be a normal
human-readable link string or list of link strings rather than an opaque ID object.

Example future schema and record value:

```yaml
# Projects/Projects.db.md
properties:
  client:
    type: relation
    target: Clients
    cardinality: one
```

```yaml
# Projects/Website.md
client: "[[Clients/Acme|Acme]]"
```

For a many-valued relation:

```yaml
dependencies:
  - "[[Projects/API]]"
  - "[[Projects/Design system|Design system]]"
```

## Why Not Make Every Link A Relation?

Most knowledge links are intentionally loose. Requiring database membership and schema for every
connection would make ordinary writing heavier and would prevent links to folder pages, database
pages, and notes outside the target collection.

Relations earn a separate type only when structured behavior is needed:

- constrain the chooser to a collection;
- express one-versus-many cardinality;
- filter and sort on related records;
- show selected properties from related records;
- support rollups later.

Obsidian demonstrates that internal links work in both note bodies and atomic YAML text/list
properties. Notion demonstrates the additional semantics of a relation: database targeting,
one-way or two-way behavior, cardinality, and rollups. Rumi should keep the portability of the first
model and selectively add the structured behavior of the second.

References:

- https://obsidian.md/help/links
- https://obsidian.md/help/properties
- https://www.notion.com/help/relations-and-rollups

## Canonical Reference Rules

- Accept both Wikilinks and normal Markdown links in body content.
- Use quoted Wikilink strings for internal links in YAML text/list values because they are compact,
  readable, and interoperable with Obsidian properties.
- Resolve from a normalized workspace-relative logical path; `.md` may be omitted in the display
  syntax.
- Keep optional display labels in the link string, not in a `{ path, label }` YAML object.
- Do not require object IDs in Markdown. Internal object identity can help the server repair known
  moves without becoming canonical content.
- Surface missing or ambiguous targets; do not silently choose one.

## Directionality

Start future relations as one-way canonical values. Backlinks and reverse-relation views should be
derived from the server index.

Do not initially write a mirrored property into the related record. Mirrored writes create
multi-file atomicity, external-edit, conflict, and rename problems. A reciprocal stored property can
be considered later only when the runtime has a transactional multi-file command and the workflow
cannot be expressed as a derived reverse view.

## Reference Repair

- Rumi-controlled move/rename: repair known body/property links through one runtime command.
- External move while watched: repair only when the fingerprint match is unique.
- Offline or ambiguous move: preserve content and surface a repair choice.
- Derived backlinks never need a reciprocal file write.

The runtime now performs this repair after the durable rename or move has completed. The command
returns after moving the target and refreshing its search entry; scanning and rewriting referring
Markdown continues as tracked background work. Normal Markdown destinations, Wikilinks, reference
definitions, HTML `href` values, and quoted YAML link strings are repaired outside code examples.
Each changed page is checkpointed before the repair and reindexed afterward.

The official editor writes normal Markdown links for generated `@` mentions. When a generated label
exactly matches the old filename title, repair updates that label to the new title. Deliberate custom
labels and Wikilink aliases are preserved.

## Delivery Order

1. Internal link parsing, autocomplete, navigation, backlinks, and broken-link reporting.
2. One-way `relation` properties using the same reference parser, with target and cardinality.
3. Relation-aware filters and derived reverse views.
4. Rollups and optional reciprocal stored relations only after multi-file transaction semantics.

## Current Branch Boundary

Typed database relation editing, relation-aware filtering, and rollups are intentionally not
implemented in this branch. The current database parser reports unsupported property names and
schema writes preserve their raw YAML definitions, so a manually authored future property is not
destroyed by the current client.

## Open Questions

- Should a target database be required, or may a relation target any page while still adding
  cardinality and relation UI?

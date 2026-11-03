---
status: ready
type: research
milestone: M07
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
created: 2026-11-03
updated: 2026-11-03
---
# Confirm Private Page Reports Against Their Original Source

## Goal

Confirm the 0.1.20 image-gallery and Markdown-escaping fixes against the original reported pages.

## Scope

`https://my.ilchik.com/cars` and `https://qs.ilchik.com/todo` require authentication (their page APIs
returned HTTP 401 during implementation). The source was unavailable, so verification used local
regression fixtures rather than these exact private documents. Rumi 0.1.20 fixes adjacent/mixed
image parsing, relative asset resolution, and unnecessary underscore/tilde escaping, and proves
repeated Markdown saves stay stable, including across formatting boundaries.

## Owner Layer

editor

## Test Coverage

- [ ] With authorized access to the original pages, verify all expected images load and editing
  unrelated prose does not add unnecessary escapes or change literal formatting.

## Done When

The reports are confirmed resolved against their original source, or a minimal fixture captures any
remaining failure in a separately scoped fix.

---
status: accepted
areas:
  - editor
  - web
  - files
  - testing
impact: high
created: "2026-06-22"
updated: "2026-06-22"
---
# Editor Live State And Save Boundary

## Decision

Use ProseMirror as the live editor state and Markdown as the durable file format.

Serialize to Markdown when saving, not on every ProseMirror transaction.

## Flow

```text
open page
  -> server reads Markdown
  -> client parses into ProseMirror doc
  -> user edits ProseMirror doc
  -> debounce save
  -> serialize to Markdown for save
  -> server validates version/hash
  -> server writes file and updates index
```

## Why

The current editor pipeline puts Markdown serialization on the change path. That adds performance pressure and makes editor bugs easier to create.

## Consequences

- React state should not store the full body string on every keystroke.
- Editor commands should be centralized.
- Markdown roundtrip tests are mandatory from the beginning.

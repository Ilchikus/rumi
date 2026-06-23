# Testing

Testing is part of the feature pipeline, not separate bookkeeping.

Core rule:

```text
No meaningful feature is complete until its important behavior is covered by tests.
```

Coverage follows ownership.

## Test Ladder

Use this ladder:

1. Runtime tests.
2. Markdown roundtrip tests.
3. API contract tests.
4. CLI tests.
5. UI smoke tests.

Test the runtime directly first. UI tests should be small and reserved for important wiring or fragile interactions.

## Runtime Tests

Use temp directories and real files.

Cover:

- Open workspace.
- Read tree.
- Open page.
- Save page.
- Create page/folder/database.
- Rename/move/delete.
- Reference repair.
- SQLite index updates.
- External edit reconciliation.

Runtime tests should not need a browser or HTTP server.

## Markdown Tests

Markdown is a data integrity layer.

Roundtrip coverage should include:

- Paragraphs and headings.
- Lists and indentation.
- Task items.
- Blockquotes.
- Tables.
- Code blocks and Mermaid.
- Images/assets.
- Bookmarks.
- Links and internal refs.
- Highlights, underline, strikethrough, and custom syntax.
- Empty documents and blank lines.

The editor can use ProseMirror as live state, but Markdown remains the durable format.

## API Tests

API tests should verify:

- Request/response shape.
- Version conflict behavior.
- Error shape.
- Event emission when relevant.
- Auth later.

Do not expose one endpoint per old Electron IPC method. API tests should protect domain commands.

## CLI Tests

CLI tests should verify:

- Exit codes.
- Human output basics.
- `--json` output shape.
- Direct runtime mode.
- Server API mode later.

The CLI must not implement separate workspace behavior.

## UI Smoke Tests

Use UI smoke tests for flows where wiring matters:

- Open workspace.
- Open page.
- Edit and autosave.
- Receive external change event.
- Rename from sidebar and keep active page coherent.
- Basic database record update.

Avoid huge brittle UI suites early.

## Done Means

`done` means:

- The selected coverage exists.
- The relevant tests pass.
- The feature works through the owning layer.
- The UI or CLI uses the same runtime behavior when applicable.

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
# M01-001 Workspace Format Package

## Goal

Define the shared workspace/file format helpers.

## Scope

- Recognize pages, folder pages, database configs, records, assets, and ignored internals.
- Normalize workspace-relative paths.
- Provide helpers for `.index.md`, `.db.md`, `.assets/`, and `.rumi/`.
- Include Markdown/frontmatter parsing boundaries.

## Out Of Scope

- HTTP API.
- Web UI.
- Full database querying.

## Owner Layer

runtime

## Required Coverage

- [x] Runtime test for path/kind classification.
- [x] Runtime test for folder page and database config detection.
- [x] Markdown/frontmatter test for one normal YAML block.

## Done When

- Runtime code can classify workspace nodes without Electron.
- Tests cover normal pages, folder pages, databases, records, assets, and ignored paths.

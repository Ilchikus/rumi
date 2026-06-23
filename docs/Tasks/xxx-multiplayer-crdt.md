---
status: idea
type: research
milestone: later
owner_layer: editor
coverage:
  - markdown
  - api
created: "2026-06-22"
updated: "2026-06-22"
---
# Multiplayer And CRDT Research

## Goal

Decide whether true multiplayer needs ProseMirror collab, Yjs, another CRDT, or a simpler operation log.

## Current Bias

Do not start here.

Progression:

1. Versioned full-document save.
2. Better conflict UI.
3. Server-side operation log.
4. Block-aware diffs.
5. Presence and cursors.
6. CRDT only if needed.

## Required Coverage

- [ ] Tests depend on chosen collaboration model.

## Notes

The first product risk is safe single-user, multi-device editing. True collaboration comes later.

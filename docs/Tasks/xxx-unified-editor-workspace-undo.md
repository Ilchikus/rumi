---
status: idea
type: feature
milestone: later
owner_layer: editor
coverage:
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-07-27"
updated: "2026-07-27"
---
# Unified Editor And Workspace Undo

## Goal

Present one user-facing `Cmd/Ctrl+Z` and redo chain across editor changes and reversible workspace
operations. Moving an item to Trash and restoring it should each behave as one history entry.

The intended experience for an open page is:

1. Edit the page.
2. Move it to Trash.
3. Undo once to restore and reopen it.
4. Undo again to continue through its earlier editor changes.

## Current Bias

Do not put asynchronous file operations directly into ProseMirror history transactions. Introduce
a session-level undo coordinator above the editor that can sequence two internal history systems:

- grouped ProseMirror document changes;
- asynchronous runtime commands for workspace mutations.

This should feel like one chain to the user while retaining the correct implementation boundary.

## Important Constraints

- Preserve or recover editor history by stable document identity when an open page is removed and
  its editor instance unmounts.
- Register editor history groups rather than individual keystrokes.
- Close the current editor history group when a workspace operation enters the chain.
- Store the actual Trash item ID and restored destination returned by each runtime command.
- Update an entry after undo or redo because a repeated move to Trash receives a new Trash ID.
- Validate expected paths and versions before undoing. External edits, moves, occupied restore
  paths, or another client may invalidate an entry; fail safely instead of overwriting.
- Undoing Restore moves the restored item back to Trash without discarding edits made after the
  restore.
- Permanent deletion is never added as a reversible entry.
- Keep the first implementation session-only. Persisting an undo chain across reloads, server
  restarts, or multiple clients is a separate design problem.

## Open Questions

- Should a chain cross normal navigation between multiple pages, reopening the document that owns
  the next editor entry, or remain scoped to the current document plus workspace operations?
- How should undo communicate a restore-path collision when the original path is occupied?
- Should the same command entry power both the keyboard shortcut and a temporary Undo action in
  the success message?

## Required Coverage

- [ ] Editor test proves grouped text history remains ordered around a workspace entry.
- [ ] Runtime/API tests cover Trash and Restore undo/redo cycles without overwriting conflicts.
- [ ] UI smoke test proves deleting an open page, undoing, and undoing its prior edit.
- [ ] UI smoke test proves redo follows the same chain.
- [ ] Conflict tests cover external moves, edits, and occupied restore paths.

## Related Work

- `M07-003-portable-trash-restore.md`
- `Decisions/017-rumi-owned-revision-history.md`
- `Decisions/020-portable-workspace-trash.md`

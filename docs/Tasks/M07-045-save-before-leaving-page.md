---
status: verify
type: feature
milestone: M07
release: "0.1.18"
owner_layer: web
coverage:
  - ui-smoke
created: "2026-10-05"
updated: "2026-10-05"
---
# M07-045 Save The Open Page Before Leaving It

## Goal

Never lose edits typed within the autosave delay when the user leaves the page.

## Found

During 0.1.18 QA (2026-10-05), and reproduced on `main` (0.1.17). The page could be left by
opening another page, Settings, Uploads, Trash, a Trash item, or by Back/Forward. Leaving within
~800 ms of the last keystroke either cancelled the pending autosave (`openNode` resets the save
state) or saved stale Markdown after the editor unmounted. The edit was lost, including after
returning to the page.

## Scope

- One App helper, `saveOpenPageBeforeLeaving`, starts the pending save while the editor still holds
  the latest Markdown. Every navigation entry point calls it first.
- A save that finishes after the user has left drops the page cache entry, so returning loads the
  saved version.

## Required Coverage

- [x] Browser QA: edit, then immediately switch page, open Settings, and alternate edits across two
      pages. Every edit persisted, and returning shows it.
- [ ] An App-level automated test. App has no render harness yet; consider one when App is split.

## Done When

Rapid edit-and-navigate sequences never lose text.

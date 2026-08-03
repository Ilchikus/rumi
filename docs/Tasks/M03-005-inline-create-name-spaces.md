---
status: done
type: feature
milestone: M03
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-01"
updated: "2026-08-03"
---
# M03-005 Inline Create Name Spaces

## Goal

Allow ordinary spaces while creating or renaming workspace items from the sidebar, matching inline
page-title rename and the runtime's existing portable filename support.

## Scope

- Preserve the raw controlled input value while the user is typing.
- Continue replacing path separators and portable filename-unsafe characters.
- Trim leading and trailing whitespace only when the name is submitted.
- Apply the same behavior to page, folder, and database creation and sidebar rename.

## Out Of Scope

- Changing the set of portable filename-unsafe characters.
- Changing collision suffixes or runtime create/rename behavior.
- Changing inline page-title split behavior.

## Owner Layer

web, using the existing workspace-name sanitizer and runtime commands.

## Required Coverage

- [x] Workspace-format unit test proves sanitization preserves in-progress surrounding spaces while
      final cleaning trims them.
- [x] Sidebar input regression test proves a trailing typed space survives long enough to enter the
      next word.
- [x] Existing runtime create/rename coverage remains green.
- [x] Manual UI smoke creates a page, folder, and database containing spaces.

## Implementation Notes

Sanitization and final cleaning are separate operations. `sanitizeWorkspaceName` should replace
unsafe characters without trimming; `cleanWorkspaceName` remains the submit/runtime boundary that
trims and validates the final value.

## Done When

- Typing `Project notes` in the sidebar creates `Project notes.md`.
- Sidebar rename accepts the same spaces as inline title rename.
- Leading/trailing submit whitespace does not become part of a workspace filename.

## Verification

- Workspace-format, sidebar, and complete repository test suites pass.
- User browser QA confirmed sidebar creation and rename with spaces before the `0.1.12` release.

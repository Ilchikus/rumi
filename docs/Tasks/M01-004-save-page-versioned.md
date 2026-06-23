---
status: done
type: foundation
milestone: M01
owner_layer: runtime
coverage:
  - runtime
  - api
created: "2026-06-22"
updated: "2026-06-22"
---
# M01-004 Save Page With Version

## Goal

Implement safe page saving with stale-write detection.

## Scope

- `savePage`.
- `baseVersion` or base content hash.
- Frontmatter/body serialization.
- Conflict result when saved file changed.
- Index update hook placeholder.

## Required Coverage

- [x] Runtime test saves normal page.
- [x] Runtime test rejects stale save.
- [x] Runtime test preserves valid frontmatter/body structure.
- [x] API contract test for conflict response.

## Done When

- Saving through runtime cannot silently overwrite a newer file.

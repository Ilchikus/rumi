---
status: verify
type: test
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-17"
updated: "2026-08-17"
---
# M07-024 Navigation Regression Audit

## Goal

Prove that explicit cold routes win over startup preferences and deletion returns to the latest
surviving visited page for every supported page kind.

## Scope

- Audit explicit cold routes across ordinary, companion, database-record, encoded, and system URLs.
- Audit current-page, record, folder-subtree, and database-subtree trash navigation.
- Change implementation only for a reproduced gap.

## Required Coverage

- [x] Cold-route integration coverage with Home, Last visited, and stale startup snapshots.
- [x] Post-trash history coverage including database records and deleted subtrees.
- [x] Full release checks.

## Done When

Explicit cold routes always remain authoritative and the workspace root is used after deletion only
when no valid visited page survives.

## Verification

- The audit found no implementation gap: explicit page, encoded, record, Settings, and Trash routes
  already remain authoritative over both startup modes and stale cached selections.
- Page-visit history tests cover record deletion, deleted database subtrees, latest surviving page,
  and root-only fallback.
- `corepack pnpm check` and `corepack pnpm check:server-package` pass for the `0.1.16` candidate.

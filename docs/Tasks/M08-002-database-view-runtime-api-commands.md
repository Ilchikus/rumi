---
status: done
type: feature
milestone: M08
owner_layer: runtime
coverage:
  - runtime
  - api
created: 2026-07-23
updated: 2026-07-23
---
# M08-002 Database View Runtime And API Commands

## Goal

Expose database view, visibility, and property creation as versioned product commands.

## Scope

- Add create, update, duplicate, and delete database-view runtime commands.
- Add the record-page property visibility command.
- Add a create-database-property command with optional active view context.
- Let `queryDatabase` resolve saved filters/sorts by view ID and combine transient filters with the
  saved root through `and`.
- Expose the commands through typed HTTP routes and the headless API client.
- Publish normalized `database.schemaChanged` events only after durable writes.

## Out Of Scope

- UI state or menus.
- Non-table view implementations.

## Owner Layer

runtime

## Required Coverage

- [x] Runtime tests cover version conflicts, unique IDs/names, collision-safe duplicate names, and
  last-view deletion rejection.
- [x] Runtime test proves query-by-view and transient title search compose correctly.
- [x] Runtime test proves property creation updates only the intended visibility scopes.
- [x] API tests protect request/response, conflict, invalid-view, and event shapes.

## Implementation Notes

The official client should stop constructing full replacement schema objects for these operations.
Keep `updateDatabaseSchema` only where a general migration/admin boundary is still needed.

## Done When

- Full and embedded clients can perform every view/config mutation through typed intent commands
  without writing `.db.md` or rebuilding query logic.

## Verification

- Runtime and server route suites pass.
- Browser-driven commands returned successful responses and survived reload from canonical files.

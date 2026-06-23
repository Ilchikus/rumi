---
status: accepted
areas:
  - server
  - api
  - web
  - cli
impact: high
created: "2026-06-22"
updated: "2026-06-22"
---
# Runtime Commands Over Low-Level API

## Decision

Expose product commands, not raw filesystem plumbing.

Use commands like:

```text
openWorkspace
getTree
openPage
savePage
createPage
createFolder
createDatabase
renameNode
moveNode
deleteNode
queryDatabase
updateRecordProperty
searchWorkspace
repairReferences
```

## Why

The current app asks UI components to coordinate file writes, index updates, store updates, and side effects. That creates stale state and fragile flows.

## Consequences

- Runtime commands update files, indexes, references, and events together.
- HTTP routes, CLI, and tests call the same commands.
- Low-level file operations stay internal.

## Avoid

```text
readFile
writeFile
dbUpsertRecord
dbIndexFolder
renameFile
```

as the primary app-facing API.

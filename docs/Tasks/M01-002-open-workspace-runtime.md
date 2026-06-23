---
status: done
type: foundation
milestone: M01
owner_layer: runtime
coverage:
  - runtime
created: "2026-06-22"
updated: "2026-06-22"
---
# M01-002 Open Workspace Runtime

## Goal

Create the initial `WorkspaceRuntime`.

## Scope

- Open workspace root.
- Validate root exists and is a directory.
- Initialize runtime services.
- Return workspace info.
- Avoid Electron, HTTP, or browser assumptions.

## Required Coverage

- [x] Runtime test opens a temp workspace.
- [x] Runtime test rejects missing root.
- [x] Runtime test rejects file-as-root.

## Done When

- Tests can instantiate the runtime directly.
- The runtime is the entry point for later API and CLI adapters.

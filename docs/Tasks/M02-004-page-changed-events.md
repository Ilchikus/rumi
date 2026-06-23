---
status: verify
type: foundation
milestone: M02
owner_layer: api
coverage:
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-06-23"
updated: "2026-06-23"
---
# M02-004 Page Changed Events

## Goal

Broadcast saved page content changes to connected web clients through normalized Rumi events.

## Scope

- Add a typed in-memory runtime event bus.
- Publish `page.changed` after successful `savePage`.
- Expose `/api/events` as an SSE stream.
- Add web client subscription logic.
- Refresh the active clean page when a matching `page.changed` event arrives.

## Out Of Scope

- Filesystem watcher/reconciler.
- WebSocket collaboration.
- Presence, cursors, CRDT operations, or durable event storage.
- Database event coverage beyond existing event types.

## Owner Layer

runtime, api, web

## Required Coverage

- [x] Runtime test for `savePage` event publication.
- [x] API test for SSE delivery.
- [ ] UI smoke/manual check with two browser clients.

## Progress

Runtime `savePage` now publishes `page.changed` after successful writes. The server exposes `/api/events` as an SSE stream, and the web client subscribes to refresh clean open pages while preserving dirty drafts.

## Done When

- Saving a page publishes `page.changed`.
- `/api/events` streams that event to connected clients.
- A clean open page refreshes when another client saves it.
- A dirty open page does not get overwritten by an incoming event.

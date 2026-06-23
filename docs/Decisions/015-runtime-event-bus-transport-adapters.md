---
status: accepted
areas:
  - runtime
  - server
  - api
  - web
impact: high
created: "2026-06-23"
updated: "2026-06-23"
---
# Runtime Event Bus With Transport Adapters

## Decision

Runtime commands publish normalized Rumi events to an internal event bus.

HTTP Server-Sent Events expose those events to browser clients for the first reactive slice. WebSocket adapters can be added later for collaboration without changing the runtime event model.

## Why

Rumi needs immediate cross-client reactivity, but workspace/domain events are not the same thing as multiplayer editor operations.

The runtime should own facts like `page.changed`, `page.moved`, and `database.recordsChanged`. Server transports should only deliver those facts to connected clients.

## Flow

```text
runtime command
  -> writes canonical files
  -> updates index later
  -> publishes normalized Rumi event
  -> SSE adapter broadcasts to web clients
  -> client invalidates/refetches affected state
```

## Consequences

- Runtime tests can assert event emission without starting HTTP.
- Server tests can assert `/api/events` transport behavior separately.
- Web clients can subscribe once instead of manually coordinating refreshes after every action.
- Watcher/reconciler work will publish into the same bus.
- Future WebSocket collaboration can reuse domain events while keeping live editor ops on a separate channel.

## Avoid

- Treating raw filesystem watcher events as client events.
- Coupling runtime command code to SSE or WebSocket details.
- Building CRDT, presence, cursor, or durable event sourcing infrastructure before the editor needs it.

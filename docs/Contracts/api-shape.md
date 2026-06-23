---
status: draft
area: api
owner: server
created: "2026-06-22"
updated: "2026-06-23"
---
# API Shape

The API adapts runtime commands to HTTP.

It should not mirror old Electron IPC one-to-one.

Core behaviors:

- Request/response validation.
- Standard error shape.
- Conflict response for stale writes.
- Auth later.
- Event stream subscription.

Example response principles:

```text
success: returns domain result
conflict: returns current version and enough info for UI
error: returns stable code and message
```

API tests should protect shape, not duplicate every runtime behavior test.

## Event Stream

`GET /api/events` is a long-lived Server-Sent Events stream for normalized Rumi events.

The API adapter does not create event meaning. It subscribes to the runtime event bus and serializes each event as SSE.

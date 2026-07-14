---
status: draft
area: api
owner: server
created: "2026-06-22"
updated: "2026-07-14"
---
# API Shape

The API adapts runtime commands to HTTP.

It should not mirror old Electron IPC one-to-one.

Core behaviors:

- Request/response validation.
- Standard error shape.
- Conflict response for stale writes.
- Configurable instance authentication at the HTTP boundary.
- Event stream subscription.

Example response principles:

```text
success: returns domain result
conflict: returns current version and enough info for UI
error: returns stable code and message
```

API tests should protect shape, not duplicate every runtime behavior test.

## Authentication

`GET /api/auth/session` reports the configured auth mode and current session. Password mode uses
`POST /api/auth/login` and `POST /api/auth/logout`; every other workspace API route, including the
event stream, requires a valid session. None mode leaves workspace routes available to the network
boundary selected by the operator.

## Event Stream

`GET /api/events` is a long-lived Server-Sent Events stream for normalized Rumi events.

The API adapter does not create event meaning. It subscribes to the runtime event bus and serializes each event as SSE.

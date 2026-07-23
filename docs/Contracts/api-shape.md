---
status: draft
area: api
owner: server
created: "2026-06-22"
updated: "2026-07-23"
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

Current command groups include workspace/tree/page mutation, database schema/record/query, indexed
search, Rumi revision checkpoint/list/content/restore, workspace asset upload/read, authentication,
portable Trash list/restore, and normalized events.

Opening a Markdown record directly inside a database includes its database path, schema, and schema
version in the page response. This lets any client render typed record properties without querying
or downloading every database record. Creating a select option is a versioned database-schema
command; the client does not write `.db.md` directly.

Database view creation/update/deletion, record-page property visibility, and database property
creation are also versioned domain commands. Database queries accept an optional stable view ID;
the runtime applies that view's nested saved filters and sorts. Full-page and embedded clients use
the same command shapes described in the [database views contract](database-views.md).

`POST /api/assets?fileName=...` accepts bounded raw asset bytes and returns the runtime-selected
relative `.assets/` path. `GET /api/asset?path=...` serves only allowlisted image/PDF formats from
safe workspace paths. The client never receives a raw workspace filesystem path.

`POST /api/nodes/delete` moves the requested user-content payload to workspace-local Trash.
`GET /api/trash` lists recoverable items and their original relative paths.
`POST /api/trash/restore` accepts a trash item ID and returns both the original and actual restored
path; the actual path differs when collision-safe restore is required.

Create, rename, move, asset upload, and restore commands never overwrite an occupied destination.
They return the actual selected path, using `Name (1)`, `Name (2)`, and later parenthesized suffixes
when the requested sibling name already exists.

## Official Client Serving

The server may serve the built official web client from the same origin. This is a distribution
adapter only: custom clients can use the API without the web build, and `--api-only` keeps the server
headless. Non-API browser routes fall back to the client entry point; unknown `/api/*` routes retain
structured JSON errors.

The official client uses same-origin History API routes without reloading its shell:

```text
/<workspace folder>/<extensionless page>
/trash
```

Pages, folders, databases, and database records follow their real workspace hierarchy without type
prefixes. Route segments are lowercase, replace whitespace with a single `-`, preserve ordinary
`-` and `_` characters, and hide `.md`. If sibling names would produce the same slug because of
spacing, punctuation, case, or page/directory overlap, the router adds the first available numeric
suffix (`-2`, `-3`, and so on). `/trash` remains reserved for application Trash, so a top-level
workspace item named Trash is disambiguated the same way. The server's SPA fallback makes these
URLs refreshable and directly shareable.

## Authentication

`GET /api/auth/session` reports the configured auth mode and current session. Password mode uses
`POST /api/auth/login` and `POST /api/auth/logout`; every other workspace API route, including the
event stream, requires a valid session. None mode leaves workspace routes available to the network
boundary selected by the operator.

## Event Stream

`GET /api/events` is a long-lived Server-Sent Events stream for normalized Rumi events.

The API adapter does not create event meaning. It subscribes to the runtime event bus and serializes each event as SSE.

---
status: draft
area: api
owner: server
created: "2026-06-22"
updated: "2026-08-19"
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
portable Trash list/restore, workspace settings, and normalized events.

`GET /api/workspace/settings` returns normalized editor/upload settings plus the server-supported
upload constraints. `PUT /api/workspace/settings` accepts the complete normalized settings object,
validates and atomically persists it through the runtime, preserves unrelated top-level
configuration domains, and returns the applied result. The official client never writes
`.rumi/config.json` directly.

Opening a Markdown record directly inside a database includes its database path, schema, and schema
version in the page response. This lets any client render typed record properties without querying
or downloading every database record. Creating a select option is a versioned database-schema
command; the client does not write `.db.md` directly.

Opening any page also includes its typed shared presentation and an independent presentation
version. `PUT /api/page/image-presentation` accepts one page path, image source, at least one typed
patch field (integer CSS-pixel width or `left`/`center`/`full` alignment), and an optional base
presentation version. It merges that patch and returns the complete updated page presentation or a
conflict. The client never reads or writes `.rumi/presentation.json` directly, and the API does not
expose a generic arbitrary metadata object.

Database view creation/update/deletion, record-page property visibility, and database property
creation are also versioned domain commands. Database queries accept an optional stable view ID;
the runtime applies that view's nested saved filters and sorts. Full-page and embedded clients use
the same command shapes described in the [database views contract](database-views.md).

`POST /api/assets?fileName=...` accepts raw asset bytes and returns the runtime-selected
relative `.assets/` path. `GET /api/asset?path=...` serves only allowlisted asset formats from
safe workspace paths. The HTTP adapter does not add a fixed 50 MB product ceiling; the runtime
enforces the current workspace-specific size and format policy so settings updates apply without a
restart. A `null` maximum means no Rumi file-size limit, zero disables uploads, and an empty format
allowlist also disables uploads. Incoming bytes stream through hidden temporary storage, size limits
are enforced as data arrives, and a verified upload appears atomically in `.assets/`; incomplete or
invalid uploads are removed. The client never receives a raw workspace filesystem path.

`POST /api/nodes/delete` moves the requested user-content payload to workspace-local Trash.
`GET /api/trash` lists recoverable items and their original relative paths.
`GET /api/trash/:id` reads a recoverable page for the muted read-only Trash view.
`POST /api/trash/restore` accepts a trash item ID and returns both the original and actual restored
path; the actual path differs when collision-safe restore is required.
`DELETE /api/trash/:id` permanently removes the selected Trash payload after the client obtains
explicit user confirmation.

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
/settings
```

Pages, folders, databases, and database records follow their real workspace hierarchy without type
prefixes. Route segments are lowercase, replace whitespace with a single `-`, preserve ordinary
`-` and `_` characters, and hide `.md`. If sibling names would produce the same slug because of
spacing, punctuation, case, or page/directory overlap, the router adds the first available numeric
suffix (`-2`, `-3`, and so on). `/trash` and `/settings` are reserved for application pages.
Top-level workspace content named Trash or Settings remains valid and resolves to `/trash-2` or
`/settings-2`; Rumi does not reject portable filesystem names. A successful create or rename that
uses one of these reserved root slugs shows an informational toast linking to the corresponding
system page. The server's SPA fallback makes these URLs refreshable and directly shareable.

## Authentication

`GET /api/auth/session` reports the configured auth mode and current session. Password mode uses
`POST /api/auth/login` and `POST /api/auth/logout`; every other workspace API route, including the
event stream, requires a valid session. None mode leaves workspace routes available to the network
boundary selected by the operator.

## Event Stream

`GET /api/events` is a long-lived Server-Sent Events stream for normalized Rumi events.

The API adapter does not create event meaning. It subscribes to the runtime event bus and serializes each event as SSE.

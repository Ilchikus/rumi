---
status: accepted
areas:
  - server
  - cli
impact: medium
created: "2026-06-22"
updated: "2026-06-22"
---
# Fastify Pino Logging

## Decision

Use Fastify/Pino as the server logging system instead of creating a custom logger.

## Why

Fastify already provides a solid logging foundation:

- Request-scoped logs.
- Standard levels.
- Error handling.
- Structured JSON output for production.
- Pretty output through `pino-pretty` for local debugging.

The useful Rumi-specific work is semantic messages, not a parallel logging system.

## Behavior

Default server mode should stay quiet and print warnings/errors.

Verbose mode should print key workspace/API events:

```text
rumi serve ./docs --verbose
```

Explicit log control:

```text
rumi serve ./docs --log-level debug
rumi serve ./docs --json-logs
```

## Key Events

- `workspace.info`
- `tree.read`
- `page.open`
- `page.save`
- `page.save.conflict`
- `page.create`
- `folder.create`
- `node.rename`
- `node.move`
- `node.delete`

## Consequences

- Keep Fastify/Pino as the logging source.
- Add semantic `request.log.*` calls in route handlers.
- Use pretty logs for interactive development.
- Use JSON logs for production/self-hosted setups.

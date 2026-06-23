---
status: draft
area: cli
owner: cli
created: "2026-06-22"
updated: "2026-06-22"
---
# CLI Contract

The CLI has two modes.

## Direct Runtime Mode

For local maintenance:

```text
rumi index ./workspace
rumi reconcile ./workspace
```

The CLI loads the runtime directly, runs the command, prints result, and exits.

## Server API Mode

For running servers and remote/self-hosted workspaces:

```text
rumi status --server http://localhost:3000
rumi search "roadmap"
rumi page get personal/notes/idea.md
```

The CLI calls the same API as the web app.

## Output

Human output by default.

Machine-readable output with `--json`.

Scripts and agents must not scrape pretty terminal output.

## Server Logs

`rumi serve` should use Fastify/Pino logging.

Default mode should stay quiet for normal successful requests and print warnings/errors.

Verbose mode should print key workspace/API events:

```text
rumi serve ./docs --verbose
```

Useful events:

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

Advanced flags:

```text
rumi serve ./docs --log-level debug
rumi serve ./docs --json-logs
```

Pretty logs are for interactive debugging. JSON logs are for machines and production/self-hosted environments.

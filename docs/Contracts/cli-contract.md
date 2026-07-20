---
status: draft
area: cli
owner: cli
created: "2026-06-22"
updated: "2026-07-20"
---
# CLI Contract

The CLI has two modes.

## Direct Runtime Mode

For local maintenance:

```text
rumi index ./workspace
rumi reconcile ./workspace
rumi search ./workspace "roadmap"
rumi snapshot ./workspace Notes/Idea.md
rumi history ./workspace Notes/Idea.md
rumi database create ./workspace Tasks
rumi database query ./workspace Tasks
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
rumi serve ./docs --api-only
rumi serve ./docs --web-root ./apps/web/dist
```

Pretty logs are for interactive debugging. JSON logs are for machines and production/self-hosted environments.

## Local Serve Default

`serve` treats the current working directory as the workspace when no path is supplied:

```text
cd ./workspace
rumi serve
```

Passing an explicit workspace remains supported. Other direct-runtime maintenance commands retain
their explicit workspace arguments so scripts do not silently target the wrong directory.

## npm Distribution

The public package is `@rumi-md/server` and installs the `rumi` executable. It requires Node.js 20.11
or newer. The package contains:

- one bundled JavaScript CLI containing Rumi's internal contracts, Markdown, workspace-format,
  runtime, and server layers;
- external production dependencies such as Fastify and YAML, with no native install scripts;
- the built official web client served by default by `rumi serve`.

The internal monorepo packages remain private implementation units and are not independently
published. A release is valid only after the npm tarball is installed in a clean temporary prefix,
the installed `rumi --version` matches the package, `rumi serve` opens the current directory, the
workspace API responds, and the packaged web client loads.

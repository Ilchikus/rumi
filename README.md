<p align="center">
  <img src="apps/web/public/rumi-logo.svg" alt="Rumi" width="88" height="88" />
</p>

# Rumi

Rumi is a file-first, open-source, self-hosted Markdown editor. It runs a server on an ordinary
folder of Markdown and YAML files and provides a browser interface for editing them locally or
remotely.

[Website](https://rumi.md) · [npm](https://www.npmjs.com/package/@rumi-md/server) ·
[Public sandbox](https://sandbox.rumi.md)

Rumi keeps files as the source of truth. Its index, revisions, and other application state live in
the workspace's `.rumi/` directory and can be managed by the same runtime used by the web client
and CLI.

## Features

- Block editing for pages, folder pages, and database records.
- Markdown links, mentions, media, tables, code blocks, Mermaid, and portable YAML properties.
- Folder-backed databases with typed properties, filters, sorting, embedded views, and conversion
  to and from ordinary folders.
- Full-text search, automatic reference repair, revision history, and recoverable Trash.
- A server-owned filesystem watcher that reconciles external edits.
- Shareable workspace URLs and optional password authentication for self-hosting.

## Requirements

- Node.js 20.11 or newer.

## Install

Install the server globally:

```bash
npm install --global @rumi-md/server
```

Change into a Markdown workspace and start Rumi:

```bash
cd /path/to/your/workspace
rumi serve
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

To try Rumi without installing it globally:

```bash
npx @rumi-md/server@latest serve
```

Run `rumi --help` for the maintenance, search, database, logging, and authentication commands.

## Workspace format

Rumi uses readable files and folders:

```text
page.md

Folder/
  Folder.index.md
  child.md

Tasks/
  Tasks.db.md
  first-task.md

.assets/
```

Folder pages use `<folder>.index.md`. Databases are folders whose companion file is
`<database>.db.md`. Normal Markdown remains useful without Rumi.

## Remote hosting

The default server listens only on `127.0.0.1`. When exposing Rumi to a network, configure password
authentication and put it behind HTTPS:

```bash
rumi auth set-password . --username owner
rumi serve --host 0.0.0.0 --auth password --secure-cookies
```

Do not expose a workspace publicly with authentication disabled. See `rumi serve --help` for all
hosting options.

## Development

This repository is a pnpm workspace containing the runtime, API server, CLI, and React web client.

```bash
corepack enable
pnpm install
pnpm check
```

The main architecture and planning records live in [`docs/`](docs/docs.index.md).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a
change.

## License

Rumi is free and open-source software licensed under the
[GNU Affero General Public License v3.0 only](LICENSE). Anyone may use, study, modify, distribute,
host, or sell Rumi under the terms of that license. Modified versions offered over a network must
make their corresponding source available as required by the AGPL.

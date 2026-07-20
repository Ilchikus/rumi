# Rumi Server

Rumi is a file-native workspace server with a browser interface. Markdown and YAML files remain the
canonical source of your content.

## Requirements

- Node.js 20.11 or newer

## Install

```bash
npm install --global @rumi-md/server
```

## Start a workspace

Change into any directory containing your Markdown workspace and run:

```bash
rumi serve
```

Then open `http://127.0.0.1:3000`.

You can also pass the workspace explicitly:

```bash
rumi serve ./my-workspace
```

Use `rumi --help` to see maintenance, search, database, logging, and authentication commands.

## Local installation

```bash
npm install @rumi-md/server
npx rumi serve
```

## Without installing

```bash
npx @rumi-md/server@latest serve
```

Rumi creates its rebuildable index and application state under `.rumi/` inside the workspace. Your
normal Markdown files remain portable and readable without Rumi.

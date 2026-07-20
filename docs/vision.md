# Vision

Rumi New is a file-native workspace runtime with a web client.

It should feel like the best parts of Obsidian and Notion:

- Obsidian-like ownership through plain files.
- Notion-like pages, folders, databases, and rich editing.
- A server runtime that handles indexes, watching, APIs, CLI, agents, and future collaboration.




## Product Bet


Rumi should not be primarily an Electron app.


Rumi should not be a browser-only local file editor.


Rumi should become:


```text
A local-first/self-hosted workspace server with a browser UI.
```


Offline mode is still possible because the server can run on localhost.


Self-hosted mode is natural because the same server can run on a VPS, home server, LAN machine, or Tailscale node.


Hosted mode is an extension of the same structure, not a separate architecture.


## Runtime Shape


```text
Official web client / custom clients / CLI / agents / scripts
        |
        v
Rumi server API and event stream
        |
        v
Workspace runtime
        |
        v
Files + SQLite index + watcher + reconciler
```


The runtime is the product center. The official web client is the primary interface and reference implementation. The CLI is the setup, control, and automation surface.


The official web client should be built on a headless client core rather than coupling all behavior directly to React components. That headless layer should own reusable client-side behavior: typed API commands, event subscriptions, save/conflict flows, editor integration boundaries, and shared workspace state. The official UI layer should own presentation, layout, styling, gestures, dialogs, and product-specific interaction flows.


Custom user clients are a future extension point, not an MVP requirement. The architecture should leave room for them by keeping the server API stable and the official client layered, so alternate clients can use the same contracts without reimplementing workspace correctness.


## Core Principles

- Files are more important than the app.
- Markdown/YAML files remain the canonical source of user content.
- SQLite is a rebuildable index/cache, not source of truth.
- The server owns workspace operations and cross-file consistency.
- Headless client code owns reusable API/event/save state and conflict behavior.
- UI clients own interaction, presentation, editor surface state, and optimistic UI.
- The CLI and web client use the same commands.
- Git/GitHub sync is deferred.
- Linux server compatibility matters from day one.

## Workspace Model


Keep the current strong file model:


```text
Page:
  page.md

Folder as page:
  Folder/
    Folder.index.md
    child.md

Database as folder:
  Tasks/
    Tasks.db.md
    task-a.md
    task-b.md

Assets:
  .assets/
```


This is one of Rumi's strongest ideas. A folder can be both a container and content. A database can be both a collection and a rich page.


## URL Model


Local:


```text
http://localhost:3000
http://rumi.localhost/w/personal
```


Self-hosted:


```text
https://mydomainforrumi.org/w/personal
```


Hosted:


```text
https://ilchik.rumi.md/w/personal
```


Recommended hierarchy:


```text
subdomain = user / org / tenant
path = workspace
```


Use `rumi.localhost` for local domain experiments, not `rumi.md`, because `.localhost` is reserved for local loopback and avoids public-site conflicts.


## Integration Path


Agents and scripts should prefer the Rumi API over direct file writes.


Direct external file edits must still be supported, because file ownership matters. But first-class integrations should go through server commands so Rumi can validate writes, update indexes, repair references, version later, and broadcast events.

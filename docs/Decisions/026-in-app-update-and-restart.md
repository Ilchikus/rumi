---
status: accepted
areas:
  - server
  - cli
  - web
  - hosting
  - security
impact: medium
created: "2026-10-05"
updated: "2026-10-05"
---
# In-App Update Installs From npm And Restarts In Place

## Decision

The server compares its own version with the `latest` dist-tag of `@rumi-md/server` on the public
npm registry. When the installed copy is a global npm install, the web client can request an
update. The server then installs that exact version with `npm install --global` and restarts itself
in place.

The restart is a handoff. The worker closes the HTTP server and the runtime, and the original
`rumi serve` process stays alive as a small supervisor that starts the newly installed code with the
same arguments, environment, and terminal. The supervisor exists only after the first in-app
update. Later updates exit the worker with a dedicated restart code, and the supervisor starts a
fresh worker.

Self-update is offered only when all of these are true:

- The running entry point resolves inside the global npm root.
- The request comes from a signed-in owner (password auth), or it is a direct request from the same
  machine: a loopback client address with no proxy or tunnel headers (`Forwarded`,
  `X-Forwarded-*`, `X-Real-IP`, `CF-Connecting-IP`, or Rumi's dev-proxy header).
- The operator has not passed `--no-update-check`.

A loopback listener alone is not enough, because reverse proxies and tunnels (for example the
Cloudflare-fronted sandbox) also connect from loopback. Found during QA on 2026-10-05.

In every other case, the client shows the version and the command to run manually.
`--no-update-check` also disables the registry request entirely.

## Why

Most installs follow the README (`npm install --global`), so in-place update covers the common case
without asking users to set up a process manager. Keeping the original process as the supervisor
keeps the terminal session, systemd unit, or container PID stable, avoids port races, and does not
grow a chain of processes across repeated updates.

The install target is always the exact registry `latest` version the server already reported, so
the endpoint cannot be used to install arbitrary packages.

## Consequences

- npx, pnpm, Docker, and source checkouts get the manual path; nothing tries to guess their package
  managers.
- A failed install, such as `EACCES` on a system-owned Node prefix, leaves the running server
  untouched and reports the npm error along with the manual command.
- Proxied instances without password auth automatically fall back to the manual command. Public
  or managed instances, such as the sandbox, should still run with `--no-update-check` to skip the
  registry request entirely.

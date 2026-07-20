---
status: done
type: feature
milestone: M02
owner_layer: api
coverage:
  - api
  - ui-smoke
  - cli
created: 2026-06-22
updated: 2026-07-18
---
# Configurable Instance Authentication

## Goal

Add a small, self-contained authentication boundary that works for local, self-hosted, and
Rumi-hosted instances without making `rumi.md` a required identity broker.

## Scope

- Support two initial instance modes:
  - `none` for loopback, private LAN, or private-overlay deployments where the operator accepts
    network access as the trust boundary.
  - `password` for an application-owned login with one server-local username and password.
- Keep loopback as the default server bind even though an operator may explicitly bind to LAN.
- Store credentials and sessions in server state outside the workspace.
- Hash passwords; never store plaintext passwords or session tokens.
- Protect every workspace API route and the SSE stream in password mode.
- Use an HTTP-only, same-site session cookie and same-origin checks for browser mutations.
- Let a server owner set or reset the local login from the CLI. A reset invalidates all sessions.
- Keep TLS and public routing outside the auth module. Cloudflare Tunnel is one supported transport,
  not an identity dependency.
- Leave room for future interchangeable providers such as trusted-proxy/Cloudflare Access and OIDC.
- Defer multiple users, roles, workspace permissions, account recovery email, and a hosted control
  plane.

## Contract

- `GET /api/auth/session` reports the configured mode and current session.
- `POST /api/auth/login` creates a password-mode session.
- `POST /api/auth/logout` revokes the current session.
- In `none` mode, auth session reports authenticated and workspace APIs remain compatible.
- In `password` mode, unauthenticated requests to all other `/api/*` endpoints return `401`,
  including `/api/events`.
- Password configuration is explicit at server start. Starting password mode without configured
  credentials fails closed.
- The web client does not mount the workspace UI until the auth session is established.

## Required Coverage

- [x] API tests for none mode, login, logout, invalid credentials, protected APIs, and SSE.
- [x] Auth storage tests for password hashing, session hashing, reset invalidation, and permissions.
- [x] CLI coverage for password setup/reset and serve-mode parsing.
- [x] Web typecheck and login smoke coverage.

## Notes

The first public development instance serves the repository's `docs` workspace at
`https://dev-docs.rumi.md` in password mode. Its username is `ilchik`; its password is
operator-held server state and must not be committed to the workspace.

The runtime remains auth-unaware. Authentication belongs to the HTTP/API boundary, while the CLI
retains direct owner access to workspace and credential maintenance on the host.

## Current Development Deployment

- `dev-docs.rumi.md` routes through the locally managed `rumi-dev-docs` Cloudflare Tunnel.
- The tunnel reaches the loopback Vite source server on port `5173`; Vite proxies `/api` to the
  password-protected Rumi server on port `3001`.
- The Vite source server runs from the `codex/finish-rumi-new` worktree. The API process runs from
  the detached `rumi-new-live` deployment worktree so server changes must be synchronized there and
  the process restarted before they are visible on DevDocs.
- A separate built preview on port `4173` remains available for LAN development.
- Password login refuses non-loopback HTTP. LAN users must use the Cloudflare HTTPS hostname; plain
  HTTP on port `4173` can load the login shell but cannot transmit credentials.
- API/official client, LAN preview, source development, and tunnel processes run in the `rumi-new-dev` tmux
  session. This is a development deployment, not yet a boot-persistent service unit.
- Tailscale remains independent management transport for SSH/Codex access and is not in the public
  browser request path.

## Verification

Verified on 2026-07-14:

- `corepack pnpm typecheck`
- `corepack pnpm test` — 39 tests passed
- production web build through Vite
- anonymous public workspace API returns `401`
- public HTTPS login returns `200` with `Secure`, `HttpOnly`, and `SameSite=Lax` cookie attributes
- authenticated public workspace API returns `200`
- logout revokes the session
- Cloudflare reports four active tunnel edge connections

Security hardening on 2026-07-14 also verified CSP, HSTS, frame denial, restricted Vite filesystem
access, per-client login throttling behind the trusted local proxy, and rejection of executable
Markdown link schemes.

Verified after the branch deployment on 2026-07-18:

- `corepack pnpm check` — typecheck, 67 tests, and the production web build passed;
- `corepack pnpm audit --prod` — no known vulnerabilities;
- the Cloudflare Tunnel connects directly to `127.0.0.1:3001` with four healthy edge connections;
- the public and loopback HTML bodies are identical;
- fingerprinted assets return `public, max-age=2592000, immutable`;
- public CSP, HSTS, frame denial, password-mode session boundary, and anonymous API `401` remain;
- direct-Tunnel login requests are throttled independently by validated Cloudflare client address.

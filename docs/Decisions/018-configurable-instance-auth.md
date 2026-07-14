---
status: accepted
areas:
  - server
  - api
  - web
  - cli
  - hosting
  - security
impact: high
created: "2026-07-14"
updated: "2026-07-14"
---
# Configurable Instance Authentication

## Decision

Rumi owns a replaceable authentication boundary at the HTTP server layer. The first implementation
has `none` and `password` modes.

`none` preserves the simple local and private-network experience. `password` provides one
server-local account, application login, and server-side sessions without contacting `rumi.md` or
any third-party identity provider.

## Ownership Boundary

```text
browser -> HTTPS / private network -> Rumi HTTP auth -> workspace API -> runtime -> files
```

- A reverse proxy or Cloudflare Tunnel owns routing and TLS.
- The Rumi HTTP layer owns authentication, sessions, cookies, and browser request checks.
- The runtime and canonical workspace files do not know about authentication.
- The host CLI is the recovery authority and can set or reset the local credential.

Credentials, password hashes, and sessions are instance state outside the workspace. They must not
be synced as pages, indexed as content, or committed with a hosted workspace.

## Initial Modes

### None

Use for loopback, a trusted LAN, or a private overlay such as Tailscale. This mode deliberately has
no application login. The operator owns the network exposure decision.

### Password

Use for the first public and small self-hosted deployments. It has one username per instance, a
memory-hard password hash, opaque server-side sessions, an HTTP-only same-site cookie, mutation
origin checks, and per-client login throttling. Resetting the password invalidates every active
session.

Password login requires HTTPS except for a loopback client. A trusted local web proxy overwrites
forwarding metadata before requests reach the API; arbitrary LAN clients cannot promote HTTP to a
secure request by supplying forwarded headers.

## Future Providers

The HTTP boundary may later add providers without changing the runtime or workspace model:

- trusted proxy identity, including Cloudflare Access headers verified at the origin;
- bring-your-own OIDC for Google, GitHub, enterprise identity, or a future Rumi broker;
- hosted multi-user accounts and workspace authorization.

The provider proves an identity. A later authorization layer decides which workspaces and actions
that identity may access.

## Consequences

- A public Rumi instance does not depend on `rumi.md` being online.
- Self-hosters can choose the smallest trust model appropriate for their network.
- Hosted and custom-domain instances can reuse the same application boundary.
- Password mode is intentionally single-user and is not yet corporate identity or multi-tenant
  authorization.
- Cloudflare Access remains an optional outer gate, not the only way to secure Rumi.

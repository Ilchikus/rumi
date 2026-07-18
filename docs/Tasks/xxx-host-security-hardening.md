---
status: doing
type: feature
milestone: later
owner_layer: api
coverage:
  - api
  - cli
  - ui-smoke
  - docs
created: 2026-07-14
updated: 2026-07-18
---
# Development Host Security Hardening

## Goal

Audit and reduce the attack surface of the Rumi Cloudflare Tunnel, browser/API client, and SSH over
Tailscale without breaking the active remote development path.

## Confirmed Findings

- The Vite development server was bound to every interface and allowed unauthenticated byte-for-byte
  reads of repository files through `/@fs/`.
- Password login was available over plaintext LAN HTTP, exposing credentials and cookies to that
  network.
- The public built client lacked CSP, HSTS, framing, referrer, and browser capability headers.
- Login throttling saw the local proxy address instead of the real Cloudflare client address,
  allowing one attacker to deny login globally.
- The Cloudflare `cert.pem` account certificate remained on the host after tunnel creation. It was
  account-wide, while the tunnel only needs its tunnel-scoped JSON credential to run.
- OpenSSH listens on wildcard IPv4 and IPv6 addresses through `ssh.socket`; password authentication
  is enabled; UFW is disabled.
- Five unrestricted Ed25519 keys were authorized, including a third-party-labeled key.
- Tailnet Lock is not enabled. Tailscale SSH is disabled, so the host uses ordinary OpenSSH over the
  WireGuard network.
- Samba ports `139`/`445` and unrelated development services on `3000`/`3737` also listen on every
  interface. Their intended exposure must be decided before enabling a deny-by-default host firewall.

## Applied Fixes

- Bound Vite source development to loopback and restricted its filesystem allowlist.
- Moved LAN browser access to the built preview on port `4173`; on 2026-07-18 the public tunnel moved
  from that preview to the loopback Rumi server on port `3001`, which now serves the same built
  client with the API.
- Reject password login over non-loopback HTTP.
- Overwrite trusted proxy metadata, discard spoofed Cloudflare headers from non-loopback clients,
  and throttle public login by validated `CF-Connecting-IP`, including direct loopback Tunnel
  connections.
- Added CSP, HSTS, frame denial, MIME sniffing denial, referrer policy, permissions policy, COOP, and
  CORP headers to the built client.
- Added a regression test proving unsafe `javascript:` and `data:` Markdown URLs do not become links.
- Restricted every authorized SSH key to Tailscale, Tailscale IPv6, and the local `/24`; disabled
  agent and X11 forwarding per key. A mode-`0600` rollback copy is retained beside the key file.
- Removed the account-wide Cloudflare certificate from the host. The mode-`0400` tunnel-specific
  credential remains and the connector stayed healthy.
- Added `scripts/harden-host-ssh.sh`, with validation and automatic rollback, for the root-level SSH
  listener and authentication changes.

## Pending Operator Actions

- [ ] Run `sudo scripts/harden-host-ssh.sh --apply`, then verify a fresh Tailscale SSH connection;
  SSH must remain available over Tailscale and LAN.
- [ ] Confirm whether the `yegorklymenchuk@gmail.com` authorized key should remain.
- [x] Retain Samba and standard SSH access on this host.
- [ ] Decide whether the unrelated ports `3000`/`3737` need LAN or Tailscale access before enabling
  UFW with a deny-by-default incoming policy.
- [ ] Consider a narrow Tailscale grant for port `22` and Tailnet Lock with at least two signing
  nodes and safely stored disablement secrets.
- [ ] Optionally revoke the old Cloudflare Tunnel account token in the Cloudflare dashboard; the
  host copy has already been deleted.

## Verification

- `corepack pnpm audit --prod`: zero known vulnerabilities across 147 production dependencies.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm test`: 39 tests passed.
- production web build: passed.
- Vite repository-file probe: changed from `200` with an exact source hash to `403` on loopback; the
  source server is no longer reachable from LAN.
- LAN HTTP password-login probe: `426 secure_transport_required`.
- public HTTPS login, authenticated tree read, and logout: `200`; cookie remained `Secure`,
  `HttpOnly`, and `SameSite=Lax`.
- credential rotation to the operator-selected `ilchik` login invalidated existing sessions; the
  new login, authenticated tree read, and logout were verified through the public HTTPS hostname.
- public security headers and post-certificate-removal tunnel health: verified.
- direct server/client deployment, 30-day immutable fingerprinted-asset caching, and four restarted
  Tunnel edge connections: verified on 2026-07-18.

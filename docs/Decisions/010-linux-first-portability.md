---
status: accepted
areas:
  - server
  - cli
  - hosting
  - security
impact: high
created: "2026-06-22"
updated: "2026-06-22"
---
# Linux-First Portability

## Decision

Design the core server with Linux remote servers in mind from day one.

## Day-One Constraints

- No macOS-only filesystem assumptions.
- Watcher events are hints.
- Support headless Linux.
- Use high unprivileged ports by default.
- Assume Caddy/Nginx/Traefik for public deployments.
- Do not depend on Finder Trash.
- Handle case sensitivity differences.
- Avoid sibling names that collide on case-insensitive systems.
- Support Docker volume mounts.

## Later

- Homebrew install.
- Docker image.
- `systemd` service.
- `launchd` service.
- macOS menu bar app.
- macOS desktop shell.

Start with CLI. Do not build native macOS UI yet.

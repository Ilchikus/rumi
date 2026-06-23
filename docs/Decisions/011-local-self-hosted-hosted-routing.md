---
status: accepted
areas:
  - hosting
  - server
  - web
  - security
impact: medium
created: "2026-06-22"
updated: "2026-06-22"
---
# Local, Self-Hosted, And Hosted Routing

## Decision

Use one routing model that works locally, self-hosted, and hosted.

## URLs

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

## Hierarchy

```text
subdomain = user / org / tenant
path = workspace
```

## Notes

- `rumi.localhost` is better than `rumi.md` for local use.
- `/etc/hosts` maps hostnames only, not paths or ports.
- Removing the port needs a local gateway/proxy.
- Public exposure needs auth and HTTPS.

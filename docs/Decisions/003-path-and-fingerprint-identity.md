---
status: accepted
areas:
  - files
  - index
  - watcher
impact: high
created: "2026-06-22"
updated: "2026-06-22"
---
# Path And Fingerprint Identity

## Decision

Do not add required Rumi IDs to normal Markdown files.

Use:

```text
path = visible/source identity
content fingerprint/hash = recovery signal
server index = operational memory
```

## Why

Required `rumi_id` metadata in every page drifts away from file ownership. If a user opens a file in Obsidian or another editor, they should not see irrelevant app machinery.

Readable filenames should stay readable. Do not put IDs in filenames.

## Consequences

- Rumi-controlled moves must repair references.
- External moves are best-effort through watcher reconciliation and fingerprints.
- The server index can remember previous paths and hashes.

## Fingerprint Signals

- Full content hash.
- Frontmatter hash.
- File size.
- Modified time proximity.
- Similar path/name.
- Known outgoing links.
- Known frontmatter values.

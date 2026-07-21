---
status: accepted
areas:
  - workflow
  - hosting
impact: high
created: "2026-07-21"
updated: "2026-07-21"
---
# AGPL Open-Source License

## Decision

Rumi is distributed as free and open-source software under the GNU Affero General Public License
version 3 only (`AGPL-3.0-only`). The repository, official server package, web client, runtime, and
first-party documentation use the same license unless a file explicitly states otherwise.

Anyone may use, study, modify, redistribute, host, or sell Rumi under the AGPL. Operators who offer
a modified version to users over a network must provide the corresponding source as required by
the license.

Incoming contributions use the same `AGPL-3.0-only` license. Contributors retain copyright in their
work; Rumi does not require copyright assignment or reserve an exclusive commercial license.

## Why

Rumi is a self-hosted server and web client. AGPL preserves ordinary open-source freedoms while
ensuring that improvements used to provide a network service remain available to that service's
users. A single license keeps community contributions and the official npm distribution simple and
honest.

## Distribution

- The repository root contains the complete license text in `LICENSE`.
- The npm package includes the same license and declares `AGPL-3.0-only` in its metadata.
- The public README and website identify Rumi as AGPL-licensed open-source software.

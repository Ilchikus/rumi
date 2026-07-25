---
status: accepted
areas:
  - workflow
  - hosting
impact: high
created: "2026-07-21"
updated: "2026-07-25"
---
# MIT Open-Source License

## Decision

Rumi is distributed as free and open-source software under the MIT License (`MIT`). The repository,
official server package, web client, runtime, and first-party documentation use the same license
unless a file explicitly states otherwise.

Anyone may use, study, modify, redistribute, host, sublicense, or sell Rumi, including as part of
proprietary software, provided the license and copyright notice are preserved.

Incoming contributions use the same `MIT` license. Contributors retain copyright in their work;
Rumi does not require copyright assignment or reserve an exclusive commercial license.

## Why

Rumi prioritizes maximum adoption, low-friction self-hosting, integration, and commercial use. The
project does not plan to make network-copyleft enforcement part of its product or business model
and does not have the resources to investigate private modifications. A short permissive license
keeps the terms easy to understand and removes avoidable compliance review for adopters.

This supersedes the earlier AGPL decision. The project accepts that modified forks and hosted
services may remain proprietary. Releases through `0.1.7` remain available under their original
AGPL terms; releases beginning with `0.1.8` use MIT.

## Distribution

- The repository root contains the complete license text in `LICENSE`.
- The npm package includes the same license and declares `MIT` in its metadata.
- The public README and website identify Rumi as MIT-licensed open-source software.

# Contributing to Rumi

Thank you for helping improve Rumi. Bug reports, design feedback, documentation improvements, and
code contributions are welcome.

## Before starting

- Search existing issues and pull requests for related work.
- Open an issue before a large feature or architectural change so its scope can be agreed first.
- Keep changes focused and preserve Markdown/YAML files as the canonical source of workspace data.

## Development setup

Rumi requires Node.js 20.11 or newer and uses the pnpm version declared in `package.json`.

```bash
corepack enable
pnpm install
pnpm check
```

Add focused tests for behavior that belongs to the runtime, API, CLI, Markdown layer, or fragile UI
wiring. The project workflow and testing conventions are documented in
[`docs/workflow.md`](docs/workflow.md) and [`docs/testing.md`](docs/testing.md).

## Pull requests

- Explain the user-visible outcome and the reason for the change.
- Include relevant tests or explain why the change does not need them.
- Keep unrelated formatting and refactors out of the pull request.
- Confirm `pnpm check` passes.

## Contribution license

Rumi is licensed under the GNU Affero General Public License v3.0 only. By submitting a
contribution, you agree to license it under `AGPL-3.0-only` and confirm that you have the right to do
so. Contributors retain copyright in their contributions.

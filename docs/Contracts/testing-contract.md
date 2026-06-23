---
status: draft
area: testing
owner: shared
created: "2026-06-22"
updated: "2026-06-22"
---
# Testing Contract

Every task declares required coverage.

Coverage types:

- Runtime test.
- Markdown/editor test.
- API test.
- CLI test.
- UI smoke test.

Rules:

- Test runtime behavior at runtime level first.
- Test Markdown as a data integrity layer.
- Test API shape separately from runtime internals.
- Test CLI output and exit behavior.
- Keep UI smoke tests small.

`done` requires the chosen coverage to exist and pass.

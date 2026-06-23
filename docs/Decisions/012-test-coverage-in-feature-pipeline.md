---
status: accepted
areas:
  - workflow
  - testing
impact: high
created: "2026-06-22"
updated: "2026-06-22"
---
# Test Coverage In Feature Pipeline

## Decision

Every meaningful feature should include test coverage as part of the task pipeline.

## Rule

```text
No feature is complete until its important behavior is covered by tests.
```

## Why

Rumi's riskiest bugs are data and coordination bugs:

- File corruption.
- Stale overwrite.
- Broken links.
- Wrong database index.
- Missed watcher change.
- Editor serialization drift.
- CLI and web behavior diverging.

## Consequences

Coverage follows ownership:

- Runtime behavior gets runtime tests.
- Markdown behavior gets roundtrip tests.
- API behavior gets contract tests.
- CLI behavior gets CLI tests.
- Fragile UI wiring gets small smoke tests.

Avoid coverage theater. Test the behavior that can break the product.

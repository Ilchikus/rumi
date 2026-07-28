---
status: done
type: feature
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: 2026-07-27
updated: 2026-07-28
---
# M07-009 System Pages And Reserved Routes

## Goal

Make Settings and Trash feel like editor-native pages while keeping their application routes
distinct from equally named workspace content.

## Scope

- Reserve `/settings` and `/trash` for system pages.
- Keep top-level workspace items named Settings or Trash valid and route them through deterministic
  `-2` collision suffixes.
- Show an informational toast after a successful reserved-name create or rename, with a link to the
  corresponding system page.
- Render Settings and Trash with the editor page container and title treatment.
- Keep the address bar at the editor-page maximum width regardless of content width.
- Restyle Trash item metadata and actions.
- Present Settings as compact name, description, and option rows with lowercase dotted extensions.

## Owner Layer

web

## Required Coverage

- [x] Route parsing and reserved-slug collision tests.
- [x] UI smoke coverage for the shared system-page layout and address-bar width.
- [x] UI smoke coverage for reserved-name feedback and revised Trash/Settings controls.
- [x] Navigation and interaction contract updates.

## Out Of Scope

- Rejecting reserved names at the runtime or filesystem layer.
- Dedicated video playback.
- Changing canonical workspace filenames.

## Done When

- `/settings` and `/trash` open system pages, while same-named root content resolves to `-2`.
- Successful create and rename attempts with reserved root names show linked feedback.
- Settings and Trash visually align with ordinary editor pages.
- Focused tests and the repository checks pass.

## Verification

Verified on 2026-07-28:

- focused route, Settings, Trash, sidebar, and editor-layout tests passed
- headless visual smoke at 1120 × 760 covered `/settings`, `/trash`, the CSS-only sticky ancestor
  release sequence, and a real user page at `/settings-2`
- `corepack pnpm check` passed: 48 test files, 303 tests, typecheck, production web build, and
  bundled `@rumi-md/server` build
- `corepack pnpm check:server-package` clean-installed and exercised `@rumi-md/server@0.1.9`
- `corepack pnpm audit --prod` reported no known vulnerabilities after the release dependency
  refresh

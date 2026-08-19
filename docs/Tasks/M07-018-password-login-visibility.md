---
status: verify
type: feature
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-14"
updated: "2026-08-17"
---
# M07-018 Password Login Visibility

## Goal

Let a user confirm the password they entered without adding another stop to the login form's
keyboard tab order.

## Scope

- Add a password visibility control inside the password field.
- Toggle between masked and visible password text only when the control is clicked.
- Keep the control out of sequential keyboard focus and keep pointer interaction focused on the
  password field.
- Give the control an accessible name and pressed state that reflect the current visibility.
- Bump the distributable `@rumi-md/server` release candidate to `0.1.16`.

## Out Of Scope

- Authentication API, credential-storage, or password-reset changes.
- Changes to username behavior or login submission.
- A keyboard shortcut for password visibility.

## Owner Layer

web

## Required Coverage

- [x] UI interaction test for masked/visible state, click-only behavior, focus preservation, and
      exclusion from the tab order.
- [x] Full typecheck, tests, production build, and server-package release check before release.

## Done When

- The login password starts masked.
- Clicking the visibility control alternates between masked and visible text without moving focus
  away from password entry.
- Tab navigation skips the visibility control.
- The installable server package passes its `0.1.16` release check.

## Verification

Verified on 2026-08-17:

- focused password visibility interaction coverage passed;
- the production login page rendered correctly in headless Chrome with the visibility control
  aligned inside the password field;
- `corepack pnpm check` passed with 73 test files and 604 tests, typecheck, the production web
  build, and the bundled server build;
- `corepack pnpm check:server-package` verified the installable `@rumi-md/server@0.1.16` package.

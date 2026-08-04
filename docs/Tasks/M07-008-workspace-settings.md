---
status: done
type: feature
milestone: M07
owner_layer: runtime
coverage:
  - runtime
  - api
  - ui-smoke
  - docs
created: 2026-07-27
updated: 2026-07-29
---
# M07-008 Workspace Settings

## Goal

Expose workspace-owned settings in the official client and let an owner configure upload policy
and editor misspelling highlighting without editing `.rumi/config.json` by hand.

## Scope

- Add normalized runtime commands to read and update workspace settings.
- Preserve unrelated top-level configuration when writing `.rumi/config.json`.
- Expose upload-size and allowed-format constraints through the API.
- Apply upload-policy changes to subsequent uploads without restarting the server.
- Keep 50 MB as the default while allowing blank/unlimited and zero/disabled size policies.
- Include MP4 and WebM in the upload-format policy without adding dedicated video playback.
- Default browser misspelling highlighting off and let the workspace setting enable it.
- Default inline replacements and colon emoji suggestions on and let workspace settings disable
  either behavior independently.
- Add workspace settings UI opened by a Phosphor Gear action above Trash.
- Use native Sky 600 checkboxes and a borderless two-column format layout.
- Remove the sidebar header and footer horizontal rules.

## Out Of Scope

- Per-user settings or roles.
- Browser-language and custom-dictionary management.
- Settings search or plugin-defined setting pages.

## Owner Layer

runtime

## Required Coverage

- [x] Runtime configuration read/write and preservation tests.
- [x] API read/update contract test.
- [x] UI smoke coverage for sidebar placement, page controls, and editor spellcheck wiring.
- [x] File-format, API, runtime-command, and editor-interaction contract updates.

## Implementation Notes

The API returns normalized settings plus supported upload constraints. The runtime remains the
validation owner and atomically writes the internal configuration file. A `null` maximum represents
the blank unlimited state; zero disables uploads; a non-negative whole number applies that many MB.
The initial centered dialog was subsequently replaced by the editor-like `/settings` system page in
M07-009 without changing the settings contract. Asset request bodies stream to hidden temporary
storage so blank/unlimited does not imply unbounded server memory buffering; complete, signature-
verified files are then published atomically. Inline replacement and emoji settings were added to
the same normalized editor settings domain and update an open editor without remounting it. The
floating/top/none inline-toolbar preference later joined that domain in M07-013.

## Done When

- Settings roundtrip through the runtime and API.
- Upload controls and misspelling highlighting are editable on the Settings page.
- The editor reflects the saved highlighting setting without remounting.
- Focused tests and the repository checks pass.

## Verification

Verified on 2026-07-28:

- focused runtime/server tests passed, including streamed, invalid, and over-limit uploads
- `corepack pnpm check` passed: 48 test files, 303 tests, typecheck, production web build, and
  bundled `@rumi-md/server` build
- `corepack pnpm check:server-package` clean-installed and exercised `@rumi-md/server@0.1.9`
- `corepack pnpm audit --prod` reported no known vulnerabilities after the release dependency
  refresh

---
status: verify
type: feature
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-04"
updated: "2026-08-04"
---
# M07-015 Workspace Startup And Session Navigation

## Goal

Make Rumi open into a stable, useful workspace immediately and make browser Back/Forward return to
the position the user left during the current browser session.

## Scope

- Reveal `Create new property` only while the page-properties area is hovered or focused, while
  keeping the action reachable on touch devices and visible while its menu is open.
- Store each route entry's editor-canvas scroll position in native browser history state and keep
  an in-memory position per page so ordinary navigation back to a page also resumes where the user
  last left it during the current application session.
- Keep scroll positions session-only: closing and reopening Rumi starts the opened page at the top.
- Persist the last visited workspace page across browser sessions.
- Add a browser-local, workspace-scoped Settings dropdown for opening Home or the last visited page
  on a cold visit to `/`; explicit deep links always win.
- Persist Settings automatically after each valid change without a manual Save button, while
  serializing requests so a slower response cannot overwrite a newer choice.
- Persist a bounded, versioned startup snapshot containing workspace identity, tree, last selection,
  and the last successfully loaded or saved page.
- Hydrate the authenticated application from the startup snapshot, then revalidate workspace, tree,
  settings, trash, and page data without allowing stale cache data to overwrite a newer page or an
  unsaved draft.
- Replace text-only startup/loading states with the stable sidebar, header, and empty editor layout.

## Out Of Scope

- Offline access without a reachable and authenticated Rumi server.
- Persisting scroll position across browser sessions.
- Treating unsaved editor drafts as authoritative cached page content.
- Sharing the startup preference through `.rumi/config.json` or between browsers.
- A general multi-page offline cache.

## Owner Layer

web

## Required Coverage

- [x] Unit coverage for startup snapshot validation, bounds, workspace mismatch, and target choice.
- [x] Unit coverage for browser-history and per-page session scroll state and restoration timing.
- [x] UI smoke coverage for Settings auto-save, the startup dropdown, stable loading shell, and
  property trigger states.
- [x] Manual browser QA for cold Home/last-visited starts and Back/Forward on long pages.

## Implementation Notes

Use the existing native History API and browser-local storage rather than adding a router or server
contract. History state is naturally scoped to the live browser history session. The persistent
startup snapshot is a convenience only: server responses remain authoritative, storage failures
fall back to the empty stable shell, and cached Markdown is never rendered before authentication.

Keep the current in-memory page request cache and prefetch behavior. The startup snapshot should
seed the first render and first page request, not create a second long-lived client state system.

## Done When

- A cold authenticated start renders stable application geometry without loading-state copy.
- Last visited is the default cold-start target and survives browser restarts; Home remains
  selectable in Settings and explicit URLs always open their requested view.
- Back and Forward restore each entry's editor-canvas position during the live browser session, while
  reopening Rumi starts at the top.
- Ordinary in-app navigation back to a previously visited page restores that page's latest position
  from memory during the same session.
- Cached tree/page content appears immediately when valid and reconciles to fresh server data.
- Property creation is quiet until the properties area is active without becoming inaccessible.
- Focused tests, full checks, package release checks, and manual browser QA pass.

## Verification

Verified on 2026-08-04:

- focused startup-cache, history-scroll, loading-shell, Settings, and property-presentation tests
  passed
- `corepack pnpm check` passed: 65 test files and 483 tests, typecheck, production web build, and
  bundled server build
- `corepack pnpm check:server-package` verified the installable `@rumi-md/server@0.1.14`
- final production-bundle QA in a disposable Chrome profile restored Page A to 900 px on Back and
  Page B to 1500 px on Forward
- closing and reopening Chrome restored Page B and its cached content at scroll position zero;
  choosing Home in Settings reopened the workspace root instead
- the no-copy workspace shell, the touch-visible property action, and persisted startup preference
  were inspected in the real browser; desktop hover/focus/open trigger states are protected by the
  UI smoke contract
- release candidate version: `@rumi-md/server@0.1.14`

Follow-up verified on 2026-08-04:

- focused history-scroll and Settings tests passed with 9 tests
- `corepack pnpm check` passed with 65 test files and 485 tests, typecheck, the production web
  build, and the bundled server build
- `corepack pnpm check:server-package` verified the installable `@rumi-md/server@0.1.14`
- real-browser QA restored Markdown Playground to 600 px through ordinary sidebar navigation,
  Why files first to 320 px through Back, and Markdown Playground to 720 px through Forward
- real-browser QA confirmed that Settings has no Save button and that a second immediate change
  waited for an intentionally delayed first response, then persisted in order; the changed setting
  was returned to its original value

User QA remains open. Per the user's release gate, the follow-up pull request must remain unmerged
until explicit user approval after testing.

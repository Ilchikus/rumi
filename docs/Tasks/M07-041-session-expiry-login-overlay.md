---
status: verify
type: feature
milestone: M07
release: "0.1.18"
owner_layer: web
coverage:
  - api
  - ui-smoke
created: "2026-10-05"
updated: "2026-10-05"
---
# M07-041 Session Expiry Login Overlay

## Goal

When the session expires or is revoked, show the sign-in screen instead of "Authentication
required" toasts, and return the user to the same page with unsaved edits intact.

## Scope

- api-client:
  - Throw a `RumiApiError` carrying `status` and `code`, with the message unchanged.
  - Accept an `onAuthenticationRequired` option, called only for 401 `authentication_required`.
    `invalid_credentials` from login does not trigger it.
- Web:
  - One shared client factory wires that callback into a tiny auth-expiry store.
  - `AuthGate` subscribes and renders the existing sign-in form as an opaque full-screen layer
    above the still-mounted app.
  - While the layer is shown, the app root is `inert`, so focus and typing cannot reach the editor.
    Saving stays blocked because requests keep failing.
- Errors with code `authentication_required` are never toasted.
- The app re-checks the session on window focus and `visibilitychange`, so a stale tab shows the
  sign-in screen before the user starts typing.
- After sign-in, the layer closes and the app does the following:
  - Retries the failed or pending save of the current draft.
  - Refreshes the tree and current data.
  - Confirms the event stream reconnected.

  The route never changes, so the user stays on the page that was active when the session expired.
- Cold loads keep the current behavior: the deep link survives sign-in.

## Out Of Scope

- Session-length changes, "remember me", or multi-user accounts.
- Offline editing beyond keeping the in-memory draft.

## Owner Layer

web

## Required Coverage

- [ ] api-client tests: a 401 `authentication_required` produces `RumiApiError` and the callback,
      while `invalid_credentials` and other errors are unchanged.
- [ ] UI smoke test: an expired save shows the overlay with no toast and keeps the app mounted with
      the draft. Signing in clears the overlay, retries the save, and keeps the route.
- [ ] Browser check: real cookie expiry and logout from another tab, then a focus check.

## Implementation Notes

Do not unmount `App`. All recovery comes from keeping its state and replaying the save. The sign-in
form markup moves into one component shared by the cold-gate and expired-overlay states.

## Done When

Deleting the session mid-edit shows the sign-in screen on the next save or focus. After signing
in, the same page is showing and the edit is saved.

---
status: done
type: feature
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-17"
updated: "2026-08-17"
---
# M07-022 Sidebar Context Menu Keyboard Contract

## Goal

Make every sidebar context menu immediately and predictably keyboard-operable.

## Scope

- Focus the first enabled item on open.
- Navigate enabled items with arrow keys and activate the focused item with Enter.
- Preserve Escape, modified creation, and focus restoration to the originating row.

## Required Coverage

- [x] DOM interaction coverage for focus, arrow wrapping, enabled-item filtering, one activation,
      and close restoration.
- [x] Regression coverage for root and node menu wiring.
- [x] Real-browser keyboard smoke.
- [x] Full release checks.

## Done When

Opening a sidebar context menu focuses its first action, arrow navigation works, and Enter invokes
exactly the focused action once.

## Verification

- Pointer-opened menus explicitly focus the first enabled item without scrolling, Up/Down wraps
  enabled items, and closing restores the originating row after Radix completes its focus handoff.
- Focused DOM and sidebar source suites pass.
- A headless Chrome smoke on the built application confirmed that right-clicking a sidebar page
  focuses Rename, Down/Up moves between Rename and Move, and Enter activates Rename exactly once.
- `corepack pnpm check` and `corepack pnpm check:server-package` pass for the `0.1.16` candidate.

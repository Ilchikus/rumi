---
status: done
type: feature
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-20"
updated: "2026-08-20"
---
# M07-027 Dark Theme

## Goal

Ship Rumi `0.1.17` with a complete dark appearance that follows the operating system by default and
can be overridden from Settings.

## Scope

- Keep the approved logo unchanged.
- Use Sky 500 for product accents and Sky 400 for their hover states.
- Use Neutral 800 for the dark application canvas and Neutral 700 for the sidebar, address bar,
  code blocks, and other subtle surfaces.
- Render the Markdown highlight as Yellow 500 at 30% opacity in Light and 20% in Dark.
- Add an `Auto` / `Light` / `Dark` Settings dropdown. Default to Auto, listen for live system-theme
  changes in Auto, and persist explicit choice browser-locally per workspace.
- Apply the resolved theme before React renders so cached workspaces do not flash light.
- Theme application shell, editor and injected editor controls, menus, dialogs, database views,
  Trash, Settings, syntax highlighting, Mermaid diagrams, and notifications.

## Out Of Scope

- Theme synchronization through workspace files or the server API.
- Additional themes or user-authored color palettes.
- Changes to the approved logo asset.

## Owner Layer

web

## Required Coverage

- [x] UI smoke test for workspace-scoped preference parsing, persistence, resolution, and DOM
  application.
- [x] UI wiring smoke for the Settings selector, live system listener, and pre-React bootstrap.
- [x] Existing surface/editor presentation tests updated to require semantic theme tokens.
- [x] Desktop and narrow-width browser QA in both themes, including live Auto changes and an
  explicit per-workspace Light override.

## Implementation Notes

Theme preference is browser-local presentation state, not shared workspace truth. The startup
snapshot supplies the workspace identity needed by the inline bootstrap; missing or invalid storage
falls back to Auto. CSS variables own palette resolution so ProseMirror DOM and dynamically injected
editor controls update without remounting. Open Mermaid previews listen for the same theme-change
event and re-render with Mermaid's matching built-in theme.

The final foreground pass keeps button labels and highlighted prose on the active theme foreground,
while checked and indeterminate Sky controls use explicit white marks in both themes.

The release header pass restores its opaque theme background, moves Create and Sidebar controls to
the left of the editor header, keeps page actions right-aligned outside the address bar, and shares
one borderless icon-button component across all three controls.

## Done When

The full release checks pass, browser QA covers Light, Dark, and Auto at desktop and narrow widths,
and `@rumi-md/server@0.1.17` packages the themed official client.

---
status: accepted
areas:
  - web
  - frontend
  - editor
impact: high
created: "2026-06-22"
updated: "2026-06-23"
---
# Frontend Stack

## Decision

Use React, Vite, Tailwind, shadcn-style local UI primitives, Phosphor icons where available, and ProseMirror for the future editor.

Default the official web client's colors to Tailwind neutral, white, and black. Use additional colors only when a product decision explicitly calls for them.

## Why

The frontend should be rebuilt fresh rather than migrated wholesale from Electron. The old app has useful ideas, but it also carries styling drift and too much state/file coordination in React.

Tailwind and shadcn-style primitives give a more consistent system for spacing, colors, controls, and interaction states.

Default to shadcn-style local primitives for menus, dialogs, popovers, buttons, inputs, and other common controls. Use custom components only when a shadcn/Radix primitive does not fit a domain-specific interaction cleanly.

The neutral-first color rule keeps the UI quiet and inspectable while the product model is still settling. Color should mark intentional semantics, not become general decoration.

## Consequences

- Web UI talks to the server API through `@rumi/api-client`.
- Sidebar CRUD calls runtime-backed API commands.
- React should own UI state, not workspace truth.
- ProseMirror will be integrated after the sidebar/file operation loop is solid.
- Existing editor behavior can be ported selectively after Markdown/runtime tests protect the file format.
- Tailwind config should stay in CommonJS (`tailwind.config.cjs`) for now. The TS Tailwind config worked in production build but caused Vite dev/PostCSS config loading issues.
- Prefer Phosphor icons for the official web client unless a missing icon or local convention makes another icon source a better fit.
- Sidebar entity icons use neutral `400` Phosphor outline icons: file for page, folder/folder-open for collapsed/expanded folders and workspaces, and table for database.

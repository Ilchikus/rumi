---
status: accepted
areas:
  - editor
  - web
  - frontend
impact: high
created: "2026-06-23"
updated: "2026-06-23"
---
# ProseMirror Foundation With Block Editor Preset

## Decision

Use ProseMirror as Rumi's editor foundation.

The official Rumi block editor should be an assembled preset on top of that foundation, not the foundation itself.

## Shape

```text
editor core
  -> schema
  -> Markdown parse/serialize
  -> commands
  -> input rules
  -> keymaps
  -> transaction/save boundary

editor kit
  -> extension registry
  -> command registry
  -> NodeView contracts
  -> menu/toolbar integration contracts

Rumi block editor preset
  -> slash menu
  -> block handles
  -> rich NodeViews
  -> selection toolbar
  -> table controls
  -> database/file/image/embed experiences

web app
  -> shadcn UI
  -> layout
  -> theme tokens
  -> runtime API wiring
```

## Why

Rumi should have an official block editor, but we should not hardwire every editor concern to one large block-editor component.

Committing to ProseMirror keeps the editing engine realistic and powerful. Keeping the block editor as a preset lets us customize behavior, themes, NodeViews, menus, and focused writing modes without changing the canonical file/runtime model.

## Current Scope

Implement a light ProseMirror editor first:

- Markdown body in.
- ProseMirror document as live state.
- Markdown body out on save.
- Minimal schema and commands.
- No block handles, slash menu, rich embeds, custom toolbar, or database-aware NodeViews yet.

## Deferred

Full Rumi block editor preset work is deferred until the pre-polish/editor-polish stage, after the runtime, sidebar, reactivity, and basic editor save loop feel solid.

## Consequences

- ProseMirror types should stay inside editor packages/components and not leak into runtime or API contracts.
- Markdown/frontmatter and runtime commands remain the app contract.
- Rich block features should be added through extension/preset boundaries, not one-off app wiring.
- Schema and Markdown syntax changes must be covered by roundtrip tests.

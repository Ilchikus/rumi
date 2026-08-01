---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
  - docs
created: "2026-08-01"
updated: "2026-08-01"
---
# M07-012 Table And Block Selection Follow-up

## Goal

Make Markdown tables behave like ordinary document blocks and keep multi-block selection quiet until
the user explicitly asks for its handle menu.

## Product Definition

- Markdown tables participate in the editor page's normal scrolling. They do not create their own
  horizontal or vertical scroll container.
- Table row/column controls are hidden while their interaction design is reconsidered. Existing
  keyboard cell navigation and column resizing remain available.
- Selected table cells and whole selected tables use the same blue highlight as other selected
  blocks, without a second neutral overlay changing the color.
- Converting a single-column table to a bullet, numbered, or task list creates one list item for
  every table row. Inline marks and soft/hard breaks inside a cell survive in that row's item.
- Selecting blocks with handles, modifiers, Mod-A, or the area marquee does not open the block
  context menu.
- The context menu opens from an explicit Mod-/ command or a right-click on a block handle.
- Right-clicking an already selected block's handle preserves the complete selection. Activating a
  handle outside the selection resets selection to only that block before its menu or drag action.

## Scope

- Remove the active table-controls plugin registration without deleting its dormant implementation.
- Remove Markdown table wrapper overflow and height constraints from both active editor style
  layers.
- Unify table selection styling with the existing blue block-selection color.
- Add table-row-aware list conversion.
- Remove selection-change and area-selection menu auto-open paths.
- Normalize handle context-menu selection before running block actions.

## Out Of Scope

- A replacement design for row and column controls.
- Changes to embedded database table scrolling.
- A new multi-column table-to-list interchange format.
- Changes to keyboard table navigation or column resizing.

## Required Coverage

- [x] Editor transaction: every single-column table row becomes one list item for each list type.
- [x] Editor transaction: inline marks and soft/hard breaks inside a table cell survive conversion.
- [x] Selection model: a selected handle preserves the selection and an outside handle resets it.
- [x] Source smoke: selection changes and marquee completion do not auto-open the context menu.
- [x] Source smoke: the active editor does not register table controls.
- [x] CSS contract: Markdown tables have no nested scroll container and use the standard blue
      selection color in both active style layers.
- [x] Regression: embedded database scroll ownership remains unchanged.
- [x] Full typecheck, test, and production build.
- [ ] Browser smoke: verify table selection, table-to-list conversion, page scrolling, marquee
      selection, and inside/outside handle right-click behavior.

## Done When

- Markdown tables scroll only with the surrounding editor page.
- No table row/column toolbar is visible.
- Table selection is visually identical in color to ordinary block selection.
- Single-column table conversion never concatenates rows or removes in-cell line breaks.
- Multi-block selection remains visible without opening a menu until an explicit menu gesture.
- An outside handle cannot accidentally run a bulk action on a stale selection.

## Verification

- `corepack pnpm typecheck`
- `corepack pnpm test` (56 files, 423 tests)
- `corepack pnpm build`
- `corepack pnpm check:server-package` verified the installable
  `@rumi-md/server@0.1.12` release candidate.
- Browser interaction smoke remains before changing this task from `verify` to `done`.

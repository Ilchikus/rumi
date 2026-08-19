---
status: done
type: docs
milestone: M07
owner_layer: docs
coverage:
  - docs
created: "2026-08-17"
updated: "2026-08-18"
---
# M07-020 Unresolved Todo Delivery Plan

## Goal

Turn every unresolved entry in `docs/todo.md` into a dependency-aware delivery plan without
treating already-delivered behavior, release-sized fixes, larger product features, and open
architecture questions as if they were the same kind of work.

This is a planning record. Each implementation slice below should receive its own task record and
required coverage when it moves to `doing`.

## Recommended Release Boundary

Keep `0.1.16` focused on the interaction work already implemented plus the bounded regressions and
asset improvements below:

1. Password visibility and caretless block deletion (`M07-018` and `M07-019`, already implemented).
2. Enter-committed, language-aware triple-backtick input.
3. Sidebar context-menu keyboard focus and activation.
4. Link activation consistency and unlink viewport stability.
5. Cold deep-link and post-trash navigation regression coverage.
6. SVG upload, SVG-source paste, and asset-reference repair as one end-to-end asset slice.
7. Inline workspace-path suggestions in the link editor.
8. The supplied logo refresh using the uploaded source SVG.

Favorites, dark theme, current-page find/replace, and block-to-database drag are independently
valuable but large enough to obscure the release gate. Plan them immediately after `0.1.16` unless
the release is intentionally expanded.

## Current-State Findings

- Triple-backtick conversion already has an input rule, but the inline-code input-session plugin
  consumes the backticks before that rule can convert the paragraph. This is a reproducible editor
  precedence bug, not a missing schema or Markdown feature.
- Explicit cold non-root URLs are already authoritative under `M07-015`. The remaining work is a
  regression audit across page, folder/database companion, record, Settings, Trash, encoded, and
  reserved-route URLs.
- Deleting the currently open node already consults page visit history before falling back to the
  workspace root. The remaining work is to reproduce the reported database-record case and protect
  all deleted-subtree cases with integration coverage.
- The link editor's **Open** action already opens external destinations in a new tab and workspace
  links in the current tab. Plain linked-text click deliberately places the caret for editing, while
  the external-link edge affordance can still open in the current tab. The desired default therefore
  needs to be applied to link activation without making ordinary text editing navigate unexpectedly.
- SVG is intentionally absent from the runtime allow-list and signature checks, and the editor has
  explicit SVG rejection. Support must be added through runtime, Settings/API, upload, rendering,
  paste, and security tests together.
- Runtime rename/move already schedules generic Markdown reference repair, but `.assets` is hidden
  from the sidebar and asset rename entry points are not fully covered. The slice needs to prove
  both Rumi-initiated and externally observed asset renames rather than assuming page-only tests are
  sufficient.
- The sidebar menu uses a controlled Radix dropdown anchored to a hidden synthetic trigger. Native
  roving focus exists, but initial focus after a pointer-opened context menu is not an explicit
  contract or tested behavior.
- Inline-link removal refocuses the editor after mutating the selection. That focus handoff is the
  likely source of the reported editor-canvas scroll jump and should be tested against the real
  scroll container.
- The existing inline-code caret-boundary task is intentionally research-only after several failed
  browser-affinity approaches. It should not be folded into the triple-backtick fix.
- The logo source is now available as `docs/.assets/logo-wrapper-4-.svg`. It has a transparent,
  non-square 500 by 462 canvas, passes the runtime static-SVG safety gate, and can be applied
  byte-for-byte to the app and sibling `rumi.md` site sources.

## Track A: `0.1.16` Stabilization

### A1. Triple-Backtick Code Block

Create `M07-021` owned by `editor`.

- Give a paragraph-start triple fence precedence over the pending inline-code session.
- Keep the fence literal until Enter, then convert a bare fence to plain code, a language fence to
  a tagged code block, and `mermaid` to editable Mermaid source.
- Register PHP as an available highlighted language.
- Keep inline-code creation unchanged elsewhere, including interrupted sessions, undo, literal
  backticks, and typing inside an existing code block.
- Cover paragraph start, mid-paragraph literals, code-block context, undo, and subsequent typing.

### A2. Sidebar Context-Menu Keyboard Contract

Create `M07-022` owned by `web`.

- Focus the first enabled menu item when the context menu opens.
- Preserve Radix roving focus for Up/Down, wrapping, disabled items, Escape, and submenu behavior.
- Activate the focused item with Enter without double-running modified create actions.
- Restore focus to the originating sidebar row when the menu closes where that row still exists.
- Add DOM interaction tests instead of source-string-only assertions, plus a real-browser smoke pass.

### A3. Link Activation And Unlink Scroll Stability

Create `M07-023` owned by `editor` after the activation decision below is confirmed.

- Keep ordinary linked-text clicks as caret placement so links remain directly editable.
- Route explicit activation consistently: external destinations open a new tab; internal workspace
  destinations open in the same tab.
- Apply that rule to the edge affordance, toolbar **Open**, and keyboard/modifier activation without
  changing portable Markdown destinations.
- On unlink, preserve the editor-canvas scroll offset and the logical selection while closing the
  popup; do not request selection scrolling as a side effect of refocusing.
- Test external, internal, scheme-less web, missing workspace destination, keyboard, pointer, and
  long-document unlink cases.

### A4. Navigation Regression Audit

Create `M07-024` as a `test` task owned by `web`; implement code changes only for a reproduced gap.

- Cold-load explicit routes with both Home and Last visited startup preferences and stale cached
  selections.
- Cover ordinary pages, root/folder/database companion pages, database records, encoded paths,
  reserved-name suffixes, Settings, Trash, and Trash-item routes.
- Delete the open page, database record, folder descendant, and database descendant after visiting
  another surviving page; each must replace-navigate to the latest surviving visited node.
- Confirm the workspace root is only the fallback when no valid history entry survives.

### A5. SVG Asset Pipeline And Rename Repair

Create `M07-025` owned by `runtime`, with editor/web/API coverage.

- Add `.svg` and `image/svg+xml` to the typed upload policy, default Settings choices, asset reader,
  upload endpoint, and package smoke fixture.
- Validate that uploaded bytes are a complete SVG document and apply the confirmed active-content
  policy before making the file visible under `.assets`.
- Render uploaded SVG through the existing image node and asset URL path.
- Detect a complete SVG source payload on normal paste outside code blocks and inline-code marks,
  create a collision-safe `.svg` asset, and insert the same image block used by file upload.
- Keep `Shift+Cmd/Ctrl+V` literal everywhere and keep normal paste literal inside code blocks and
  inline code.
- Generate a stable friendly base name such as `pasted-svg.svg`, relying on the runtime's existing
  collision suffixes instead of timestamps in durable Markdown.
- Prove that renaming or moving an asset rewrites Markdown image/link destinations relative to each
  containing document while preserving labels, fragments, external links, code examples, and
  unsaved open-page edits.
- Cover both the runtime rename command and external-filesystem rename observation. If external
  rename identity cannot be established safely, document that limitation and restrict the contract
  to explicit Rumi rename/move actions.
- Include malformed XML, non-SVG XML, oversized payload, disallowed workspace policy, active SVG
  content, duplicate name, undo, upload failure, and paste-race tests.

### A6. Inline Link Destination Suggestions

Create `M07-029` owned by `editor`.

- Search current workspace documents as the user types in the existing URL/path input.
- Render one suggestion inline in that input without opening a dropdown.
- Rank root path-prefix matches before filename-only matches, retaining directory context for a
  query such as `/docs/todo`.
- Let ArrowDown and ArrowRight cycle matches and Tab accept the visible suggestion.

### A7. Release Logo Refresh

Create `M07-030` owned by `web`.

- Replace the application/sidebar mark and favicon from `docs/.assets/logo-wrapper-4-.svg`, preserving
  the exact vector source and updating cache-busting references where needed.
- Apply the same approved asset to the `rumi.md` source in its owning checkout.
- Do not trace or embed the earlier PNG as a substitute.

## Track B: Product Features After `0.1.16`

These tracks can be designed in parallel at the product level but should ship as separate tasks and
pull requests.

### B1. Favorites

Create `M07-026` owned by `web` after the persistence decision below.

- Favorite and unfavorite pages, folders, and databases from the sidebar context menu.
- Show one **Favorites** section above the workspace tree, using the same open, prefetch, rename,
  move, and context-menu behavior as the canonical tree rows.
- Store canonical workspace paths, deduplicate them, preserve explicit user order, and remove or
  repair entries after delete, rename, move, restore, and external reconciliation.
- Never create a second content tree or treat a stale favorite as content identity.
- Cover workspace isolation, missing targets, database records if later included, and keyboard
  accessibility.

### B2. Dark Theme

Create `M07-027` owned by `web` after the theme-choice decision below.

- Convert remaining literal light colors to semantic tokens across the application shell, editor,
  dialogs, menus, database views, Trash, Settings, syntax highlighting, Mermaid, and notifications.
- Apply the theme before React renders to avoid a light flash on cold startup.
- React to operating-system changes while in System mode and persist an explicit user selection in
  browser-local, workspace-scoped UI preferences.
- Verify contrast, selection, focus, disabled, destructive, code, link, and drag/drop states in both
  themes; add visual browser smoke at desktop and narrow widths.

### B3. Current-Page Find And Replace

Create `M07-028` owned by `editor`.

- Leave native `Cmd/Ctrl+F` untouched.
- Toggle a current-page find/replace panel with `Cmd/Ctrl+Shift+F`, modeled on Sublime's compact
  workflow rather than replacing global search.
- Support literal and regular-expression modes, match count, previous/next navigation, Replace,
  Replace next, and Replace all.
- Search editable text across supported blocks while excluding non-text atoms and hidden editor
  implementation material.
- Report invalid regular expressions without changing the document; handle zero-width matches
  without loops.
- Dispatch Replace all as one ProseMirror transaction so one Undo restores the entire operation.
  Each Replace/Replace next action is likewise one normal history event.
- Preserve marks and block structure when only text changes; define and test behavior for matches
  crossing inline-mark and block boundaries before implementation.

## Track C: Editor-To-Database Drag

Create `M08-006` owned jointly by `editor` and `database` after the conversion decision below.

- Extend the block drag payload with a private Rumi MIME flavor carrying portable serialized block
  content and source-document identity, while retaining normal text/HTML fallback flavors.
- Dropping onto an existing database row appends the serialized block content to that record page.
- Dropping between rows creates a record at the indicated visual position; define how its title and
  body derive from the dragged block before implementation.
- Remove source blocks only after the runtime mutation succeeds. A failed or cancelled drop leaves
  the source document unchanged.
- Treat source deletion and target mutation as one user operation as far as practical. If cross-file
  undo cannot be atomic under the current per-page history model, expose that limitation rather
  than simulating atomicity in browser state.
- Cover one block, multi-block selection, collapsed-heading sections, same-record drops, filtered or
  sorted database views, concurrent target changes, failed saves, and keyboard-accessible
  alternatives.

## Track D: Research Backlog

### D1. Inline-Code Caret Boundary

Keep `xxx-inline-code-caret-boundary.md` in `idea`. Resume only with a browser-testable approach that
can distinguish visual caret affinity from ProseMirror typing marks in Safari/WebKit and Chromium.

### D2. Global Tags

Create a research task before implementation. Define tag syntax, escaping, frontmatter versus body
semantics, index extraction, rename behavior, search/filter integration, and compatibility with
other Markdown tools. Prefer an additive index over a new canonical data store.

### D3. Block Indentation And Grouping

Create a research task and decision record. Specify the Markdown grammar first: which block types
can be children, whether tabs or spaces encode nesting, how list containers differ from flat list
items, and how round-trip parsing behaves in external editors. Do not modify editor nesting until
the file format has unambiguous fixtures.

### D4. Two-Dimensional And Three-Dimensional Databases

Create a database architecture research task. Preserve the accepted folder-backed record model as
the current 3D database contract while comparing a distinct sheet/pivot model against storing rich
content in a property. Evaluate portability, external editing, query/index cost, schema migration,
and whether 2D tables are a new database kind or only a view.

## Dependency Order

1. Confirm the five product decisions below.
2. Add regression tests for existing navigation behavior before changing adjacent code.
3. Deliver A1 and A2 independently.
4. Deliver A3 after link activation semantics are confirmed.
5. Deliver A5 from runtime validation outward to API, Settings, editor upload/paste, then reference
   repair and browser smoke.
6. Deliver A6 independently of the link activation fix; it reuses the current workspace document
   index without changing link resolution.
7. Obtain the source SVG and deliver A7 in both owning checkouts.
8. Run the full `0.1.16` release gate: focused tests, typecheck, complete test suite, production web
   build, server bundle, installable-package smoke, and manual interaction QA.
9. Start B1-B3 as separate feature tasks; none blocks the others.
10. Start C only after its conversion and undo semantics are explicit.
11. Keep D items in research until each has a falsifiable file-format or browser-behavior proposal.

## Confirmed Product Decisions

Approved on 2026-08-17:

1. **Release boundary:** ship Track A in `0.1.16`; schedule Tracks B-D afterward.
2. **Favorites:** browser-local and workspace-scoped, with manual ordering; favorite folders,
   databases, and ordinary pages, but not individual database records initially.
3. **Theme:** Light / Dark / System selector, System by default, stored browser-locally per workspace.
4. **Link activation:** plain click continues to place the caret; explicit Open/edge/modifier actions
   open external links in a new tab and internal links in the same tab.
5. **SVG and database conversion:** accept only validated static SVG and reject unsafe input; for a
   between-row block drop, move the source only after success, derive the new record title from the
   first textual line, and preserve the complete dragged Markdown in the record body.

## Todo Accounting

Every non-empty unchecked entry from `docs/todo.md` is represented above, including the newly added
logo request. The trailing empty checkbox carries no actionable scope and can be removed when the
source checklist is reconciled. No source checkbox should be marked complete until its
implementation task reaches `done` or its verify-first audit proves the behavior and adds the
missing coverage.

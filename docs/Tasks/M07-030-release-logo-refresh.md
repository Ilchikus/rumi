---
status: verify
type: feature
milestone: M07
owner_layer: web
coverage:
  - ui-smoke
  - docs
created: "2026-08-18"
updated: "2026-08-19"
---
# M07-030 Release Brand Refresh

## Goal

Ship the latest approved Rumi logo and Sky 600 product accent in the application as part of
`0.1.16`.

## Scope

- Replace the application sidebar mark and SVG favicon from the supplied source vector.
- Update README/site references and favicon cache versions where their owning source is available.
- Use Tailwind Sky 600 for product accents and Sky 700 for related hover states.
- Keep inline link icons the same accent color as their link text, including within a text
  selection.
- Use Rose 700 text for inline code while keeping fenced code and Mermaid source neutral.
- Align the `rumi.md` header, content, and footer on the same maximum-width container.
- Verify the mark at sidebar, browser-tab, and common light-background sizes.

## Implementation

- Use `docs/.assets/light.svg` as the canonical release asset after inspecting it as a static vector
  and confirming its transparent 728 by 691 canvas.
- Copy the exact vector bytes into the app public asset; do not trace or rasterize it.
- Advance the application favicon and sidebar cache keys so browsers request the refreshed mark.
- Use Sky 600 Tailwind utilities and matching literal CSS colors on interactive product accents;
  leave semantic content colors whose data value is named `sky` unchanged.
- Let selected link icons inherit their normal link-marker foreground instead of replacing it with
  the browser's generic `HighlightText` color.
- Keep the site's existing 760px document column and align its header and footer to the full
  1004px content grid.
- Verify built and packaged application assets against the supplied source hash. The owning
  `rumi.md` site source is not present in this checkout, so site-only asset updates remain outside
  this repository's verification scope.

## Verification

- `docs/.assets/light.svg` contains only static vector markup and no script, external resource, or
  embedded raster payload.
- The supplied source and app public asset share SHA-256
  `b3f4ac76afaa8ea55949586d993bf323490a06b493ed31990a341902dc6bfb46`;
  the production and packaged copies are checked after their builds.
- App favicon and sidebar request cache version `20260819-1`.
- Checked controls, switches, links, resize affordances, and other product accents use Sky 600;
  associated hover states use Sky 700.
- Inline-highlighted link icons preserve the same Sky 600 foreground as the link text.
- `corepack pnpm check:server-package` builds and verifies installable package
  `@rumi-md/server@0.1.16`.

## Done When

The application uses the approved vector asset without a raster trace or embedded PNG substitute,
and product accents consistently use Sky 600 with Sky 700 hover states.

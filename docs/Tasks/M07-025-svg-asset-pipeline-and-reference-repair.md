---
status: verify
type: feature
milestone: M07
owner_layer: runtime
coverage:
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-08-17"
updated: "2026-08-17"
---
# M07-025 SVG Asset Pipeline And Reference Repair

## Goal

Support safe static SVG assets through upload and source paste while keeping Markdown references
correct when assets move or are renamed.

## Scope

- Add validated static `.svg` upload support through runtime, API, Settings, and editor media.
- Convert complete SVG source pasted normally outside code into a collision-safe asset and image.
- Keep plain-text paste and paste inside code literal.
- Repair Markdown asset references after supported rename/move flows.

## Required Coverage

- [x] Runtime validation, policy, collision, serving, and reference-repair coverage.
- [x] API upload and package smoke coverage.
- [x] Editor upload, paste-mode, failure, destroyed-editor race, selection, and undo coverage.
- [x] Security fixtures for malformed and active SVG content.
- [x] Contract update and full release checks.
- [ ] Real-browser upload, rendering, source-paste, and rename smoke.

## Done When

Safe SVG files behave like existing image assets, SVG source paste follows the approved modifier and
code-context rules, and supported asset renames leave valid document links.

## Verification

- Full-document XML validation accepts static SVG and rejects malformed XML, wrong roots, scripts,
  event handlers, animation, embedded documents, external references, and unsafe CSS.
- Runtime/API tests cover policy, size, collision-safe names, security response headers, late active
  content beyond the former signature window, Rumi rename repair, and uniquely fingerprinted
  external rename repair.
- Editor tests cover file upload, source paste, plain-text and code-context literals, undo, upload
  failure, and a destroyed-editor race.
- The clean-install package smoke uploads and reads static SVG, rejects active SVG, and verifies
  `@rumi-md/server@0.1.16` with its declared parser dependency.

---
status: done
type: feature
milestone: M02
owner_layer: cli
coverage:
  - cli
  - package-smoke
  - docs
created: "2026-07-20"
updated: "2026-07-20"
---
# M02-006 Distributable CLI Package

## Goal

Let anyone with a supported Node.js installation install Rumi from npm and start the current
directory with `rumi serve`.

## Scope

- Publish the server distribution as the public scoped package `@rumi-md/server`.
- Keep the installed executable named `rumi`.
- Default an omitted `serve` workspace to the current working directory.
- Bundle the private monorepo runtime/server implementation into one CLI entry point.
- Ship the built official web client inside the npm package.
- Declare only portable third-party production dependencies for npm consumers.
- Provide build, pack, clean-install, version, API, and served-web verification.

## Out Of Scope

- Publishing the internal `@rumi/*` workspace packages independently.
- Standalone native executables for machines without Node.js.
- Choosing the repository's public software license.
- Automating future releases through CI and npm trusted publishing.

## Required Coverage

- [x] CLI test proves `rumi serve` uses the current directory when the path is omitted.
- [x] Package smoke test installs the generated tarball in a clean temporary prefix.
- [x] Package smoke test checks the installed version, workspace API, and packaged web client.
- [x] The owner authorizes the first npm publish under the `rumi-md` organization.

## Implementation Notes

The npm package is a distribution adapter over the same server and runtime source used in the
monorepo. The rebuildable workspace index uses a persisted JavaScript data file under `.rumi/`,
avoiding a native database installer and npm lifecycle-script approvals. Internal Rumi packages are
bundled to prevent `workspace:*` dependencies from leaking into the published manifest.

`npm publish` creates the package under the existing organization on first publication; there is no
separate empty-package creation step in the npm organization UI.

The first release is a direct authenticated publish because npm trusted-publisher settings only
become available after the package exists. Afterward, releases should move to a GitHub Actions OIDC
trusted publisher with automatic provenance instead of storing a long-lived npm token.

## Done When

- `@rumi-md/server` is visible on npm.
- A clean machine can run `npm install --global @rumi-md/server` followed by `rumi serve`.

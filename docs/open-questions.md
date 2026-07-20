# Open Questions

These questions do not block the first runtime slice.

## Workspace Internals

- Should `.rumi/` live inside the workspace or app data for local mode?
- Should `.rumi/` be ignored by Git and external sync by default?
- Should snapshots arrive before or after the first web UI?

Current bias:

- Keep `.rumi/` inside workspace for transparency and portability.
- Hide `.rumi/` from user-facing tree.
- Treat `.rumi/` contents as rebuildable or operational unless explicitly documented.
- Use `.rumi/trash/` for portable safe deletion and preserve it as recoverable workspace state.

## References

- Should the official editor write Wikilinks or normal Markdown links in body content by default?
- Should future typed relations require a target database?
- How aggressive should auto-repair be for external moves?

Current bias:

- Follow proposed Decision 019: ordinary links first, then typed database relations that reuse the
  same human-readable link values.
- Store YAML links as quoted Wikilink strings/lists, not `{ path, label }` objects or opaque IDs.
- Keep future relations one-way on disk; derive backlinks/reverse views from the index.
- Auto-repair Rumi-controlled moves.
- Best-effort or prompt for external moves.

## Views

- Should smart/query views be `.view.md` files?
- Should they live in `.rumi/`?
- Should they be code blocks inside a page?

Current bias:

- Defer smart views until folder-backed databases are solid.

## Hosted Rumi

- Should hosted workspaces keep files on disk/volumes?
- Should hosted workspaces use object storage?
- Should hosted workspaces use database-backed documents?

Current bias:

- Do not let hosted design change the first local file-native runtime.

## Collaboration

- How far can versioned full-document save go before true multiplayer is needed?
- Should Rumi use ProseMirror collab, Yjs, or another CRDT later?
- Should block IDs live only in internal indexes or ever be written to files?

Current bias:

- Start with versioned saves and conflict UI.
- Avoid block IDs in every Markdown file.
- Add true multiplayer only after the single-user multi-device loop is safe.

---
status: draft
area: editor
owner: shared
created: "2026-06-22"
updated: "2026-06-22"
---
# Editor Save Contract

Open page returns:

```text
{
  path,
  kind,
  frontmatter,
  markdownBody,
  contentHash,
  frontmatterHash,
  version,
  databaseContext?,
  assetBaseUrl?
}
```

Save page sends:

```text
{
  path,
  baseVersion,
  frontmatter,
  markdownBody,
  reason
}
```

Save response:

```text
{
  status: "saved" | "conflict",
  path,
  version,
  contentHash,
  changedIndexes,
  events
}
```

The editor keeps ProseMirror as live state. Markdown is serialized for save.

The client must not silently overwrite if `baseVersion` is stale.

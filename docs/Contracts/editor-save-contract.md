---
status: draft
area: editor
owner: shared
created: "2026-06-22"
updated: "2026-07-20"
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

## Database Records

A Markdown record inside a folder-backed database uses the same title, properties panel, block
editor, menus, and save boundary as an ordinary page. `databaseContext` changes how property types
and shared schema actions are resolved; it does not select a separate record editor.

Creating a property from a record page first calls the versioned database-schema command. On
success, the returned schema version becomes the record editor's current database context and the
field appears empty. The record file does not need an empty placeholder value; its frontmatter is
written through the normal page save boundary when the user gives that property a value.

If the schema command conflicts, the client must not create a private YAML-only property with the
same name.

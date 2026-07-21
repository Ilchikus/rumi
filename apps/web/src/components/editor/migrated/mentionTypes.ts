export type MentionItemKind = "workspace" | "folder" | "database" | "page";
export type RenderedMentionKind = Exclude<MentionItemKind, "workspace">;

export function mentionKindForPath(path: string): RenderedMentionKind {
  const cleanPath = path.split(/[?#]/u, 1)[0]?.toLowerCase() ?? "";
  if (cleanPath.endsWith(".db.md")) return "database";
  if (cleanPath === "index.md" || cleanPath.endsWith(".index.md")) return "folder";
  return "page";
}

export function renderedMentionKind(
  kind: MentionItemKind | undefined,
  path: string
): RenderedMentionKind {
  if (kind === "workspace" || kind === "folder") return "folder";
  return kind ?? mentionKindForPath(path);
}

export type PageCopyAction = "url" | "relative-path";

interface PageCopyValueInput {
  origin: string;
  route: string;
  relativePath: string;
}

export function pageCopyValue(
  action: PageCopyAction,
  { origin, route, relativePath }: PageCopyValueInput
): string {
  if (action === "relative-path") return `/${relativePath.replace(/^\/+/, "")}`;
  return new URL(route, normalizedOrigin(origin)).href;
}

function normalizedOrigin(origin: string): string {
  return origin.endsWith("/") ? origin : `${origin}/`;
}

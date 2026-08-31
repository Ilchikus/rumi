import type { WorkspaceNode } from "@rumi/contracts";
import { workspaceUrlForNode } from "./workspaceRoute";

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

export function workspaceNodeCopyValue(
  action: PageCopyAction,
  {
    origin,
    node,
    tree
  }: {
    origin: string;
    node: WorkspaceNode;
    tree: WorkspaceNode | null;
  }
): string | null {
  const relativePath = workspaceNodeRelativePath(node);
  if (!relativePath) return null;

  return pageCopyValue(action, {
    origin,
    route: workspaceUrlForNode(node, tree),
    relativePath
  });
}

export function workspaceNodeRelativePath(node: WorkspaceNode): string | null {
  if (node.companionPath) return node.companionPath;
  if (node.kind === "workspace") return null;
  return node.path || null;
}

function normalizedOrigin(origin: string): string {
  return origin.endsWith("/") ? origin : `${origin}/`;
}

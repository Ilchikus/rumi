import type { WorkspaceNode } from "@rumi/contracts";
import { findWorkspaceNode } from "./lastOpenedPage";

const PINNED_ITEMS_KEY_PREFIX = "rumi-new-pinned-items:v1";

export interface PinnedItemStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function readPinnedItemPaths(
  storage: PinnedItemStorage | null,
  workspaceRootPath: string
): string[] {
  if (!storage || !workspaceRootPath) return [];

  try {
    const raw = storage.getItem(pinnedItemsStorageKey(workspaceRootPath));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return uniquePaths(value.filter(
      (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0
    ));
  } catch {
    return [];
  }
}

export function writePinnedItemPaths(
  storage: PinnedItemStorage | null,
  workspaceRootPath: string,
  paths: readonly string[]
): void {
  if (!storage || !workspaceRootPath) return;

  try {
    storage.setItem(
      pinnedItemsStorageKey(workspaceRootPath),
      JSON.stringify(uniquePaths(paths.filter((path) => path.length > 0)))
    );
  } catch {
    // Pinned navigation is optional; storage restrictions must not block the workspace.
  }
}

export function setPinnedItemPath(
  paths: readonly string[],
  path: string,
  pinned: boolean
): string[] {
  const current = uniquePaths(paths);
  if (!path) return current;
  if (!pinned) return current.filter((candidate) => candidate !== path);
  return current.includes(path) ? current : [...current, path];
}

export function replacePinnedItemPath(
  paths: readonly string[],
  previousPath: string,
  nextPath: string
): string[] {
  if (!previousPath || !nextPath || previousPath === nextPath) return uniquePaths(paths);

  return uniquePaths(paths.map((path) => {
    if (path === previousPath) return nextPath;
    return path.startsWith(`${previousPath}/`)
      ? `${nextPath}${path.slice(previousPath.length)}`
      : path;
  }));
}

export function resolvePinnedItemPaths(
  tree: WorkspaceNode,
  paths: readonly string[]
): string[] {
  return uniquePaths(paths).filter((path) => {
    const node = findWorkspaceNode(tree, path);
    return Boolean(node && isPinnableWorkspaceNode(node));
  });
}

export function projectPinnedWorkspaceNodes(
  tree: WorkspaceNode | null,
  paths: readonly string[]
): WorkspaceNode[] {
  if (!tree) return [];

  const nodes = resolvePinnedItemPaths(tree, paths)
    .map((path) => findWorkspaceNode(tree, path))
    .filter((node): node is WorkspaceNode => Boolean(node));
  const projectedByPath = new Map(nodes.map((node) => [
    node.path,
    clonePinnedNode(node)
  ] as const));
  const roots: WorkspaceNode[] = [];

  for (const node of nodes) {
    const projected = projectedByPath.get(node.path)!;
    const parent = nearestPinnedAncestor(node, nodes);
    const projectedParent = parent ? projectedByPath.get(parent.path) : null;
    if (projectedParent) {
      projectedParent.children = [...(projectedParent.children ?? []), projected];
    } else {
      roots.push(projected);
    }
  }

  return roots;
}

export function isPinnableWorkspaceNode(
  node: Pick<WorkspaceNode, "kind">
): boolean {
  return node.kind === "page" || node.kind === "folder" || node.kind === "database";
}

export function pinnedItemsStorageKey(workspaceRootPath: string): string {
  return `${PINNED_ITEMS_KEY_PREFIX}:${workspaceRootPath}`;
}

function clonePinnedNode(node: WorkspaceNode): WorkspaceNode {
  if (node.kind === "folder" || node.kind === "database") {
    return { ...node, children: [] };
  }
  const { children: _children, ...leaf } = node;
  return leaf;
}

function nearestPinnedAncestor(
  node: WorkspaceNode,
  pinnedNodes: readonly WorkspaceNode[]
): WorkspaceNode | null {
  let nearest: WorkspaceNode | null = null;

  for (const candidate of pinnedNodes) {
    if (
      candidate.path === node.path ||
      (candidate.kind !== "folder" && candidate.kind !== "database") ||
      !node.path.startsWith(`${candidate.path}/`)
    ) continue;
    if (!nearest || candidate.path.length > nearest.path.length) nearest = candidate;
  }

  return nearest;
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

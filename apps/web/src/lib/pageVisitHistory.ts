import type { WorkspaceNode } from "@rumi/contracts";
import { findWorkspaceNode } from "./lastOpenedPage";

const MAX_VISITED_PATHS = 50;

export function rememberVisitedPath(
  history: string[],
  currentPath: string | null,
  nextPath: string
): string[] {
  if (!currentPath || currentPath === nextPath) return history;
  return [...history, currentPath].slice(-MAX_VISITED_PATHS);
}

export function takePreviousVisitedNode(
  history: string[],
  tree: WorkspaceNode,
  deletedPath: string
): { history: string[]; node: WorkspaceNode | null } {
  const remaining = [...history];

  while (remaining.length > 0) {
    const candidatePath = remaining.pop()!;
    if (isSameOrDescendant(candidatePath, deletedPath)) continue;
    const node = findWorkspaceNode(tree, candidatePath);
    if (node) return { history: remaining, node };
  }

  return { history: remaining, node: null };
}

function isSameOrDescendant(candidate: string, parentPath: string): boolean {
  return candidate === parentPath || candidate.startsWith(`${parentPath}/`);
}

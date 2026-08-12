import type { WorkspaceNode } from "@rumi/contracts";

export function insertOptimisticWorkspacePage(
  tree: WorkspaceNode,
  pagePath: string
): WorkspaceNode {
  if (!pagePath || containsWorkspacePath(tree, pagePath)) {
    return tree;
  }

  const separatorIndex = pagePath.lastIndexOf("/");
  const parentPath = separatorIndex === -1 ? "" : pagePath.slice(0, separatorIndex);
  const name = pagePath.slice(separatorIndex + 1);

  if (!name) {
    return tree;
  }

  return insertPageUnderParent(tree, parentPath, {
    path: pagePath,
    name,
    kind: "page"
  });
}

function insertPageUnderParent(
  node: WorkspaceNode,
  parentPath: string,
  page: WorkspaceNode
): WorkspaceNode {
  if (node.path === parentPath) {
    if (!isContainerNode(node)) {
      return node;
    }

    return {
      ...node,
      children: [...(node.children ?? []), page].sort(compareWorkspaceNodes)
    };
  }

  let changed = false;
  const children = (node.children ?? []).map((child) => {
    const nextChild = insertPageUnderParent(child, parentPath, page);
    changed ||= nextChild !== child;
    return nextChild;
  });

  return changed ? { ...node, children } : node;
}

function containsWorkspacePath(node: WorkspaceNode, path: string): boolean {
  return node.path === path
    || (node.children ?? []).some((child) => containsWorkspacePath(child, path));
}

function compareWorkspaceNodes(left: WorkspaceNode, right: WorkspaceNode): number {
  const leftIsContainer = isContainerNode(left);
  const rightIsContainer = isContainerNode(right);

  if (leftIsContainer !== rightIsContainer) {
    return leftIsContainer ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

function isContainerNode(node: WorkspaceNode): boolean {
  return node.kind === "workspace" || node.kind === "folder" || node.kind === "database";
}

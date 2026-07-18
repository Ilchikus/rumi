import type { WorkspaceNode } from "@rumi/contracts";

const LAST_OPENED_PAGE_KEY_PREFIX = "rumi-new-last-opened-page";
const RESTORABLE_KINDS = new Set<WorkspaceNode["kind"]>(["page", "folder", "database"]);

export interface LastOpenedPage {
  nodePath: string;
  openPath: string;
  kind: WorkspaceNode["kind"];
}

export interface LastOpenedPageStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function readLastOpenedPage(
  storage: LastOpenedPageStorage,
  workspaceRootPath: string
): LastOpenedPage | null {
  try {
    const raw = storage.getItem(storageKey(workspaceRootPath));

    if (!raw) {
      return null;
    }

    const value = JSON.parse(raw) as Partial<LastOpenedPage>;

    if (
      typeof value.nodePath !== "string" ||
      !value.nodePath ||
      typeof value.openPath !== "string" ||
      !value.openPath ||
      !value.kind ||
      !RESTORABLE_KINDS.has(value.kind)
    ) {
      return null;
    }

    return {
      nodePath: value.nodePath,
      openPath: value.openPath,
      kind: value.kind
    };
  } catch {
    return null;
  }
}

export function writeLastOpenedPage(
  storage: LastOpenedPageStorage,
  workspaceRootPath: string,
  page: LastOpenedPage
): void {
  try {
    storage.setItem(storageKey(workspaceRootPath), JSON.stringify(page));
  } catch {
    // Persistence is a convenience; storage restrictions must not break the editor.
  }
}

export function clearLastOpenedPage(
  storage: LastOpenedPageStorage,
  workspaceRootPath: string
): void {
  try {
    storage.removeItem(storageKey(workspaceRootPath));
  } catch {
    // Ignore unavailable or restricted browser storage.
  }
}

export function findWorkspaceNode(tree: WorkspaceNode, path: string): WorkspaceNode | null {
  if (tree.path === path) {
    return tree;
  }

  for (const child of tree.children ?? []) {
    const match = findWorkspaceNode(child, path);

    if (match) {
      return match;
    }
  }

  return null;
}

function storageKey(workspaceRootPath: string): string {
  return `${LAST_OPENED_PAGE_KEY_PREFIX}:${workspaceRootPath}`;
}

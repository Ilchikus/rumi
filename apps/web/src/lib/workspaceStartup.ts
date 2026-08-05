import type { OpenWorkspaceResult, PageDocument, WorkspaceNode } from "@rumi/contracts";
import type { LastOpenedPage } from "./lastOpenedPage";

const STARTUP_SNAPSHOT_KEY = "rumi-new-workspace-startup:v1";
const STARTUP_PAGE_MODE_KEY_PREFIX = "rumi-new-startup-page-mode";

export const STARTUP_SNAPSHOT_MAX_LENGTH = 1_500_000;
export type StartupPageMode = "last-visited" | "home";

export interface BrowserStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface WorkspaceStartupSnapshot {
  schemaVersion: 1;
  cachedAt: number;
  workspace: OpenWorkspaceResult;
  tree: WorkspaceNode;
  selection: LastOpenedPage;
  page: PageDocument;
}

export function readWorkspaceStartupSnapshot(
  storage: BrowserStorage
): WorkspaceStartupSnapshot | null {
  try {
    const raw = storage.getItem(STARTUP_SNAPSHOT_KEY);
    if (!raw || raw.length > STARTUP_SNAPSHOT_MAX_LENGTH) return null;
    const value: unknown = JSON.parse(raw);
    return isWorkspaceStartupSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeWorkspaceStartupSnapshot(
  storage: BrowserStorage,
  snapshot: WorkspaceStartupSnapshot
): boolean {
  try {
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > STARTUP_SNAPSHOT_MAX_LENGTH) {
      clearWorkspaceStartupSnapshot(storage);
      return false;
    }
    storage.setItem(STARTUP_SNAPSHOT_KEY, serialized);
    return true;
  } catch {
    clearWorkspaceStartupSnapshot(storage);
    return false;
  }
}

export function clearWorkspaceStartupSnapshot(storage: BrowserStorage): void {
  try {
    storage.removeItem(STARTUP_SNAPSHOT_KEY);
  } catch {
    // Browser persistence is an optional startup optimization.
  }
}

export function snapshotMatchesWorkspace(
  snapshot: WorkspaceStartupSnapshot,
  workspaceRootPath: string
): boolean {
  return snapshot.workspace.rootPath === workspaceRootPath;
}

export function readStartupPageMode(
  storage: BrowserStorage,
  workspaceRootPath: string
): StartupPageMode {
  try {
    return storage.getItem(startupPageModeKey(workspaceRootPath)) === "home"
      ? "home"
      : "last-visited";
  } catch {
    return "last-visited";
  }
}

export function writeStartupPageMode(
  storage: BrowserStorage,
  workspaceRootPath: string,
  mode: StartupPageMode
): void {
  try {
    storage.setItem(startupPageModeKey(workspaceRootPath), mode);
  } catch {
    // Browser persistence is optional; the current view can keep working.
  }
}

export function canHydrateStartupPage(
  pathname: string,
  mode: StartupPageMode,
  cachedPageIsHome: boolean
): boolean {
  if (pathname !== "/") return false;
  return mode === "last-visited" || cachedPageIsHome;
}

function startupPageModeKey(workspaceRootPath: string): string {
  return `${STARTUP_PAGE_MODE_KEY_PREFIX}:${workspaceRootPath}`;
}

function isWorkspaceStartupSnapshot(value: unknown): value is WorkspaceStartupSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isFiniteNumber(value.cachedAt)) return false;
  if (!isWorkspace(value.workspace) || !isWorkspaceNode(value.tree) || value.tree.kind !== "workspace") {
    return false;
  }
  if (!isSelection(value.selection) || !isPageDocument(value.page)) return false;
  if (value.selection.openPath !== value.page.path) return false;

  const selectedNode = findNode(value.tree, value.selection.nodePath);
  return Boolean(selectedNode && selectedNode.kind === value.selection.kind);
}

function isWorkspace(value: unknown): value is OpenWorkspaceResult {
  return isRecord(value) && isNonEmptyString(value.rootPath) && isNonEmptyString(value.name);
}

function isSelection(value: unknown): value is LastOpenedPage {
  if (!isRecord(value) || typeof value.nodePath !== "string" || !isNonEmptyString(value.openPath)) {
    return false;
  }
  if (!isNonEmptyString(value.kind) || !["workspace", "folder", "database", "page"].includes(value.kind)) {
    return false;
  }
  return value.kind === "workspace" ? value.nodePath === "" : value.nodePath.length > 0;
}

function isPageDocument(value: unknown): value is PageDocument {
  return isRecord(value)
    && isNonEmptyString(value.path)
    && ["page", "folder", "database"].includes(String(value.kind))
    && isRecord(value.frontmatter)
    && typeof value.markdownBody === "string"
    && typeof value.contentHash === "string"
    && typeof value.frontmatterHash === "string"
    && typeof value.version === "string";
}

function isWorkspaceNode(value: unknown): value is WorkspaceNode {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.name !== "string") return false;
  if (!isNonEmptyString(value.kind) || !["workspace", "folder", "database", "page", "asset", "file"].includes(value.kind)) {
    return false;
  }
  if (value.companionPath !== undefined && typeof value.companionPath !== "string") return false;
  return value.children === undefined
    || (Array.isArray(value.children) && value.children.every(isWorkspaceNode));
}

function findNode(tree: WorkspaceNode, path: string): WorkspaceNode | null {
  if (tree.path === path) return tree;
  for (const child of tree.children ?? []) {
    const match = findNode(child, path);
    if (match) return match;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

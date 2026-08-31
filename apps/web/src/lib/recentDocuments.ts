import type {
  PageDocumentKind,
  SearchWorkspaceResultItem,
  WorkspaceNode
} from "@rumi/contracts";
import { findWorkspaceNode } from "./lastOpenedPage";

const RECENT_DOCUMENTS_KEY_PREFIX = "rumi-new-recent-documents:v1";
export const MAX_RECENT_DOCUMENTS = 50;

type RecentDocumentKind = Extract<
  WorkspaceNode["kind"],
  "workspace" | "page" | "folder" | "database"
>;

export interface RecentDocumentRecord {
  nodePath: string;
  kind: RecentDocumentKind;
}

export interface RecentDocumentStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface ResolvedRecentDocument extends SearchWorkspaceResultItem {
  nodePath: string;
}

export function readRecentDocuments(
  storage: RecentDocumentStorage,
  workspaceRootPath: string
): RecentDocumentRecord[] {
  try {
    const raw = storage.getItem(storageKey(workspaceRootPath));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];

    const records: RecentDocumentRecord[] = [];
    const seenPaths = new Set<string>();
    for (const candidate of value) {
      if (!isRecentDocumentRecord(candidate) || seenPaths.has(candidate.nodePath)) continue;
      seenPaths.add(candidate.nodePath);
      records.push(candidate);
      if (records.length === MAX_RECENT_DOCUMENTS) break;
    }
    return records;
  } catch {
    return [];
  }
}

export function recordRecentDocument(
  storage: RecentDocumentStorage,
  workspaceRootPath: string,
  node: Pick<WorkspaceNode, "path" | "kind" | "companionPath">
): void {
  if (!workspaceRootPath || !isOpenableDocumentNode(node)) return;

  const record: RecentDocumentRecord = {
    nodePath: node.path,
    kind: node.kind
  };
  const nextRecords = [
    record,
    ...readRecentDocuments(storage, workspaceRootPath).filter(
      (candidate) => candidate.nodePath !== record.nodePath
    )
  ].slice(0, MAX_RECENT_DOCUMENTS);
  writeRecentDocuments(storage, workspaceRootPath, nextRecords);
}

export function replaceRecentDocumentPath(
  storage: RecentDocumentStorage,
  workspaceRootPath: string,
  previousPath: string,
  nextPath: string
): void {
  if (!workspaceRootPath || !previousPath || !nextPath || previousPath === nextPath) return;

  const currentRecords = readRecentDocuments(storage, workspaceRootPath);
  let changed = false;
  const seenPaths = new Set<string>();
  const nextRecords: RecentDocumentRecord[] = [];

  for (const record of currentRecords) {
    const nodePath = replacePathPrefix(record.nodePath, previousPath, nextPath);
    if (nodePath !== record.nodePath) changed = true;
    if (seenPaths.has(nodePath)) {
      changed = true;
      continue;
    }
    seenPaths.add(nodePath);
    nextRecords.push({ ...record, nodePath });
  }

  if (changed) writeRecentDocuments(storage, workspaceRootPath, nextRecords);
}

export function resolveRecentDocuments(
  storage: RecentDocumentStorage,
  workspaceRootPath: string,
  tree: WorkspaceNode
): ResolvedRecentDocument[] {
  const records = readRecentDocuments(storage, workspaceRootPath);
  const resolvedRecords: RecentDocumentRecord[] = [];
  const items: ResolvedRecentDocument[] = [];

  for (const record of records) {
    const node = findWorkspaceNode(tree, record.nodePath);
    if (!node || !isOpenableDocumentNode(node)) continue;

    const openPath = openPathForNode(node);
    if (!openPath) continue;
    resolvedRecords.push({ nodePath: node.path, kind: node.kind });
    items.push({
      nodePath: node.path,
      path: openPath,
      title: displayNameForNode(node),
      kind: pageKindForNode(node),
      snippet: "",
      score: 0
    });
  }

  if (!sameRecords(records, resolvedRecords)) {
    writeRecentDocuments(storage, workspaceRootPath, resolvedRecords);
  }

  return items;
}

export function findWorkspaceDocumentNode(
  tree: WorkspaceNode,
  openPath: string
): WorkspaceNode | null {
  if (openPathForNode(tree) === openPath) return tree;

  for (const child of tree.children ?? []) {
    const match = findWorkspaceDocumentNode(child, openPath);
    if (match) return match;
  }

  return null;
}

function writeRecentDocuments(
  storage: RecentDocumentStorage,
  workspaceRootPath: string,
  records: RecentDocumentRecord[]
): void {
  try {
    storage.setItem(storageKey(workspaceRootPath), JSON.stringify(records));
  } catch {
    // Recent history is optional; storage restrictions must not block navigation.
  }
}

function isRecentDocumentRecord(value: unknown): value is RecentDocumentRecord {
  if (!isRecord(value) || typeof value.nodePath !== "string") return false;
  return isRecentDocumentKind(value.kind)
    && (value.kind === "workspace" ? value.nodePath === "" : value.nodePath.length > 0);
}

function isOpenableDocumentNode(
  node: Pick<WorkspaceNode, "path" | "kind" | "companionPath">
): node is Pick<WorkspaceNode, "path" | "companionPath"> & { kind: RecentDocumentKind } {
  if (!isRecentDocumentKind(node.kind)) return false;
  return node.kind === "page" ? node.path.length > 0 : Boolean(node.companionPath);
}

function isRecentDocumentKind(value: unknown): value is RecentDocumentKind {
  return value === "workspace" || value === "page" || value === "folder" || value === "database";
}

function openPathForNode(
  node: Pick<WorkspaceNode, "path" | "kind" | "companionPath">
): string | null {
  return node.companionPath ?? (node.kind === "page" ? node.path : null);
}

function pageKindForNode(node: { kind: RecentDocumentKind }): PageDocumentKind {
  return node.kind === "workspace" ? "folder" : node.kind;
}

function displayNameForNode(node: Pick<WorkspaceNode, "name" | "kind">): string {
  return node.kind === "page" && node.name.toLocaleLowerCase().endsWith(".md")
    ? node.name.slice(0, -3)
    : node.name;
}

function replacePathPrefix(path: string, previousPath: string, nextPath: string): string {
  if (path === previousPath) return nextPath;
  return path.startsWith(`${previousPath}/`)
    ? `${nextPath}${path.slice(previousPath.length)}`
    : path;
}

function sameRecords(
  left: RecentDocumentRecord[],
  right: RecentDocumentRecord[]
): boolean {
  return left.length === right.length && left.every(
    (record, index) => record.nodePath === right[index]?.nodePath && record.kind === right[index]?.kind
  );
}

function storageKey(workspaceRootPath: string): string {
  return `${RECENT_DOCUMENTS_KEY_PREFIX}:${workspaceRootPath}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

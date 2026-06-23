import path from "node:path";

export type WorkspaceFileKind =
  | "page"
  | "folder-index"
  | "database-config"
  | "asset"
  | "internal"
  | "file";

const INTERNAL_SEGMENTS = new Set([".rumi", ".git", "node_modules", "dist", "build", "coverage"]);
const PATH_SEPARATOR_CHARS = /[\\/]/g;
const PORTABLE_FILENAME_UNSAFE_CHARS = /[:*?"<>|]/g;
const PATH_SEPARATOR_REPLACEMENT = "⧸";
const TREE_HIDDEN_SEGMENTS = new Set([
  ".rumi",
  ".git",
  ".assets",
  ".obsidian",
  ".vite",
  "node_modules",
  "dist",
  "build",
  "coverage"
]);

export function normalizeWorkspacePath(input: string): string {
  const raw = input.replace(/\\/g, "/").trim();

  if (raw === "" || raw === ".") {
    return "";
  }

  if (raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) {
    throw new Error(`Workspace path must be relative: ${input}`);
  }

  const normalized = path.posix.normalize(raw);

  if (normalized === "." || normalized === "") {
    return "";
  }

  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Workspace path escapes root: ${input}`);
  }

  return normalized;
}

export interface WorkspaceNameSanitizationResult {
  sanitized: string;
  changed: boolean;
  replacedSeparators: boolean;
  replacedUnsafeChars: boolean;
}

export function sanitizeWorkspaceName(input: string): WorkspaceNameSanitizationResult {
  const trimmed = input.trim();
  const withoutSeparators = trimmed.replace(PATH_SEPARATOR_CHARS, PATH_SEPARATOR_REPLACEMENT);
  const sanitized = withoutSeparators.replace(PORTABLE_FILENAME_UNSAFE_CHARS, " ");

  return {
    sanitized,
    changed: sanitized !== input,
    replacedSeparators: withoutSeparators !== trimmed,
    replacedUnsafeChars: sanitized !== withoutSeparators
  };
}

export function cleanWorkspaceName(input: string): string {
  const { sanitized } = sanitizeWorkspaceName(input);
  const compacted = sanitized.trim();

  if (!compacted) {
    throw new Error("Name is required");
  }

  if (compacted === "." || compacted === "..") {
    throw new Error("Name is reserved");
  }

  return compacted;
}

export function splitWorkspacePath(relPath: string): string[] {
  const normalized = normalizeWorkspacePath(relPath);
  return normalized === "" ? [] : normalized.split("/");
}

export function isInternalPath(relPath: string): boolean {
  return splitWorkspacePath(relPath).some((segment) => INTERNAL_SEGMENTS.has(segment));
}

export function isHiddenFromTree(relPath: string): boolean {
  return splitWorkspacePath(relPath).some((segment) => TREE_HIDDEN_SEGMENTS.has(segment));
}

export function isMarkdownPath(relPath: string): boolean {
  return normalizeWorkspacePath(relPath).toLowerCase().endsWith(".md");
}

export function directoryCompanionBaseName(dirPath: string): string {
  const normalized = normalizeWorkspacePath(dirPath);
  if (normalized === "") {
    return "";
  }
  return path.posix.basename(normalized);
}

export function folderIndexPathForDirectory(dirPath: string): string {
  const normalized = normalizeWorkspacePath(dirPath);
  const base = directoryCompanionBaseName(normalized);
  if (base === "") {
    throw new Error("Workspace root does not have a folder index companion");
  }
  return path.posix.join(normalized, `${base}.index.md`);
}

export function databaseConfigPathForDirectory(dirPath: string): string {
  const normalized = normalizeWorkspacePath(dirPath);
  const base = directoryCompanionBaseName(normalized);
  if (base === "") {
    throw new Error("Workspace root does not have a database companion");
  }
  return path.posix.join(normalized, `${base}.db.md`);
}

export function isFolderIndexPath(relPath: string): boolean {
  const normalized = normalizeWorkspacePath(relPath);
  const parent = path.posix.dirname(normalized);
  const parentName = path.posix.basename(parent);
  return parent !== "." && path.posix.basename(normalized) === `${parentName}.index.md`;
}

export function isDatabaseConfigPath(relPath: string): boolean {
  const normalized = normalizeWorkspacePath(relPath);
  const parent = path.posix.dirname(normalized);
  const parentName = path.posix.basename(parent);
  return parent !== "." && path.posix.basename(normalized) === `${parentName}.db.md`;
}

export function classifyFilePath(relPath: string): WorkspaceFileKind {
  const normalized = normalizeWorkspacePath(relPath);

  if (isInternalPath(normalized)) {
    return "internal";
  }

  if (splitWorkspacePath(normalized).includes(".assets")) {
    return "asset";
  }

  if (isDatabaseConfigPath(normalized)) {
    return "database-config";
  }

  if (isFolderIndexPath(normalized)) {
    return "folder-index";
  }

  if (isMarkdownPath(normalized)) {
    return "page";
  }

  return "file";
}

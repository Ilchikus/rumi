import type { WorkspaceNode } from "@rumi/contracts";
import { findWorkspaceNodeForRoute, parseWorkspaceRoute } from "./workspaceRoute";

export function resolveWorkspaceDocumentLink(
  tree: WorkspaceNode | null,
  href: string,
  sourceDocumentPath?: string | null
): WorkspaceNode | null {
  if (!tree) return null;

  const target = linkTargetPath(href);
  if (!target) return null;

  const candidates: string[] = [];
  const addCandidate = (candidate: string | null) => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };

  if (target.rootRelative) {
    addCandidate(normalizeWorkspacePath(target.path));
  } else {
    if (sourceDocumentPath) {
      const sourceDirectory = directoryName(sourceDocumentPath);
      addCandidate(normalizeWorkspacePath(`${sourceDirectory}/${target.path}`));
    }
    if (!target.explicitRelative) {
      // Generated mentions and older Rumi links use workspace-root paths without
      // a leading slash. Keep those portable links working after URI decoding.
      addCandidate(normalizeWorkspacePath(target.path));
    }
  }

  for (const candidate of candidates) {
    const node = findNodeByOpenPath(tree, candidate);
    if (node) return node;
  }

  // A leading-slash link may be a copied Rumi application URL. Resolve it as
  // a slug only after trying the canonical workspace path, so files remain the
  // authoritative and collision-safe reference format.
  if (target.routePath) {
    const route = parseWorkspaceRoute(target.routePath);
    const routedNode = route ? findWorkspaceNodeForRoute(tree, route) : null;
    if (routedNode) return routedNode;
  }
  return null;
}

function linkTargetPath(href: string): {
  path: string;
  explicitRelative: boolean;
  rootRelative: boolean;
  routePath: string | null;
} | null {
  let value = href.trim();
  if (value.startsWith("<") && value.endsWith(">")) value = value.slice(1, -1).trim();
  if (
    !value ||
    value.startsWith("#") ||
    value.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/iu.test(value)
  ) return null;

  const suffixIndex = firstSuffixIndex(value);
  const rawPath = suffixIndex === -1 ? value : value.slice(0, suffixIndex);
  if (!rawPath) return null;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  const rootRelative = decodedPath.startsWith("/");
  const explicitRelative = decodedPath.startsWith("./") || decodedPath.startsWith("../");
  return {
    path: rootRelative ? decodedPath.slice(1) : decodedPath,
    explicitRelative,
    rootRelative,
    routePath: rootRelative ? rawPath : null
  };
}

function findNodeByOpenPath(tree: WorkspaceNode, requestedPath: string): WorkspaceNode | null {
  const openPath = tree.companionPath ?? (tree.kind === "page" ? tree.path : null);
  if (
    openPath === requestedPath ||
    tree.path === requestedPath ||
    (tree.kind === "page" && stripMarkdownExtension(tree.path) === requestedPath)
  ) return tree;

  for (const child of tree.children ?? []) {
    const match = findNodeByOpenPath(child, requestedPath);
    if (match) return match;
  }
  return null;
}

function normalizeWorkspacePath(value: string): string | null {
  const parts: string[] = [];
  for (const part of value.replace(/\\/gu, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/") || null;
}

function directoryName(path: string): string {
  const parts = path.replace(/\\/gu, "/").split("/");
  parts.pop();
  return parts.join("/");
}

function stripMarkdownExtension(path: string): string {
  return path.toLocaleLowerCase().endsWith(".md") ? path.slice(0, -3) : path;
}

function firstSuffixIndex(target: string): number {
  const queryIndex = target.indexOf("?");
  const fragmentIndex = target.indexOf("#");
  if (queryIndex === -1) return fragmentIndex;
  if (fragmentIndex === -1) return queryIndex;
  return Math.min(queryIndex, fragmentIndex);
}

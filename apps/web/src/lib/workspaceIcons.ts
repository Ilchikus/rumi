import { useSyncExternalStore } from "react";
import type { WorkspaceNode } from "@rumi/contracts";
import { assetEndpointUrl } from "./mediaAssets";
import { resolveWorkspaceDocumentLink } from "./workspaceDocumentLink";

/** A workspace item icon as stored in frontmatter `icon`, see WORKSPACE_ICON_KEY. */
export type WorkspaceIconValue =
  | { type: "emoji"; emoji: string }
  | { type: "phosphor"; name: string }
  | { type: "asset"; path: string };

const PHOSPHOR_PREFIX = "ph:";
const IMAGE_ASSET_PATTERN = /^\.assets\/.+\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

export function parseWorkspaceIcon(value: string | null | undefined): WorkspaceIconValue | null {
  const icon = value?.trim();
  if (!icon) return null;

  if (icon.startsWith(PHOSPHOR_PREFIX)) {
    const name = icon.slice(PHOSPHOR_PREFIX.length);
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) ? { type: "phosphor", name } : null;
  }

  if (IMAGE_ASSET_PATTERN.test(icon) && !icon.split("/").includes("..")) {
    return { type: "asset", path: icon };
  }

  // One emoji, possibly built from several code points (skin tones, ZWJ, flags).
  if (EMOJI_PATTERN.test(icon) && [...icon].length <= 16 && !/[\p{L}\s]/u.test(icon)) {
    return { type: "emoji", emoji: icon };
  }

  return null;
}

export function phosphorIconValue(name: string): string {
  return `${PHOSPHOR_PREFIX}${name}`;
}

export function workspaceIconAssetUrl(icon: WorkspaceIconValue & { type: "asset" }): string {
  return assetEndpointUrl(icon.path);
}

/**
 * The tree carries each item's icon. Index it by node path and companion path
 * so links to a folder, its index page, or a database config all resolve.
 */
export function workspaceIconsByPath(tree: WorkspaceNode | null): Map<string, string> {
  const icons = new Map<string, string>();
  const visit = (node: WorkspaceNode) => {
    if (node.icon && parseWorkspaceIcon(node.icon)) {
      icons.set(node.path, node.icon);
      if (node.companionPath) icons.set(node.companionPath, node.icon);
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (tree) visit(tree);
  return icons;
}

type Listener = () => void;
let iconTree: WorkspaceNode | null = null;
let iconsByPath = new Map<string, string>();
const listeners = new Set<Listener>();

/** App publishes the current tree; every surface reads item icons from here. */
export function publishWorkspaceIcons(tree: WorkspaceNode | null): void {
  if (tree === iconTree) return;
  iconTree = tree;
  iconsByPath = workspaceIconsByPath(tree);
  for (const listener of listeners) listener();
}

/** Icon of the workspace item an editor link points to, resolved like link navigation. */
export function workspaceIconForLink(href: string, sourceDocumentPath?: string | null): string | undefined {
  const icon = resolveWorkspaceDocumentLink(iconTree, href, sourceDocumentPath)?.icon;
  return parseWorkspaceIcon(icon) ? icon : undefined;
}

export function workspaceIconForPath(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path.replace(/^\.?\//u, "");
  return iconsByPath.get(normalized)
    ?? iconsByPath.get(safeDecode(normalized))
    ?? (normalized.toLowerCase().endsWith(".md") ? undefined : iconsByPath.get(`${normalized}.md`));
}

export function subscribeWorkspaceIcons(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkspaceIcon(path: string | null | undefined): string | undefined {
  return useSyncExternalStore(
    subscribeWorkspaceIcons,
    () => workspaceIconForPath(path),
    () => undefined
  );
}

/** Browser-tab icon for the workspace: emoji and Phosphor render as SVG; uploads use the asset. */
export function workspaceFaviconHref(
  icon: WorkspaceIconValue,
  phosphorPath?: string
): string | null {
  if (icon.type === "asset") return workspaceIconAssetUrl(icon);
  if (icon.type === "emoji") {
    return svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="50" dy=".35em" text-anchor="middle" font-size="86">${escapeXml(icon.emoji)}</text></svg>`
    );
  }
  if (!phosphorPath) return null;
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="#737373"><path d="${escapeXml(phosphorPath)}"/></svg>`
  );
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/gu, (character) => `&#${character.charCodeAt(0)};`);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}


/** Returns a copy of the tree with one node's icon replaced, for an immediate UI update. */
export function withWorkspaceNodeIcon(
  tree: WorkspaceNode,
  path: string,
  icon: string | null
): WorkspaceNode {
  if (tree.path === path) {
    const { icon: _previous, ...rest } = tree;
    return icon ? { ...rest, icon } : rest;
  }
  if (!tree.children || !(path.startsWith(`${tree.path}/`) || tree.path === "")) return tree;

  let changed = false;
  const children = tree.children.map((child) => {
    const next = withWorkspaceNodeIcon(child, path, icon);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...tree, children } : tree;
}

export function workspaceItemLabel(node: WorkspaceNode, workspaceName: string): string {
  if (node.kind === "workspace") return workspaceName;
  return node.kind === "page" ? node.name.replace(/\.md$/iu, "") : node.name;
}

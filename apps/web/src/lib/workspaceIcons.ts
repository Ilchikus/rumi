import { useSyncExternalStore } from "react";
import type { WorkspaceNode } from "@rumi/contracts";
import { resolveWorkspaceDocumentLink } from "./workspaceDocumentLink";

/** A workspace item icon as stored in frontmatter `icon`, see WORKSPACE_ICON_KEY. */
export type WorkspaceIconValue =
  | { type: "emoji"; emoji: string }
  | { type: "phosphor"; name: string; color?: WorkspaceIconColor }
  | { type: "asset"; path: string };

/**
 * Phosphor icon colors: Tailwind's 500 shades, with neutral as the only gray.
 * Neutral is the default and is never written, so `ph:<name>` keeps inheriting
 * the surrounding text color the way it did before colors existed.
 */
export const WORKSPACE_ICON_COLORS = [
  { name: "neutral", hex: "#737373" },
  { name: "red", hex: "#ef4444" },
  { name: "orange", hex: "#f97316" },
  { name: "amber", hex: "#f59e0b" },
  { name: "yellow", hex: "#eab308" },
  { name: "lime", hex: "#84cc16" },
  { name: "green", hex: "#22c55e" },
  { name: "emerald", hex: "#10b981" },
  { name: "teal", hex: "#14b8a6" },
  { name: "cyan", hex: "#06b6d4" },
  { name: "sky", hex: "#0ea5e9" },
  { name: "blue", hex: "#3b82f6" },
  { name: "indigo", hex: "#6366f1" },
  { name: "violet", hex: "#8b5cf6" },
  { name: "purple", hex: "#a855f7" },
  { name: "fuchsia", hex: "#d946ef" },
  { name: "pink", hex: "#ec4899" },
  { name: "rose", hex: "#f43f5e" }
] as const;

export type WorkspaceIconColor = (typeof WORKSPACE_ICON_COLORS)[number]["name"];

export const DEFAULT_WORKSPACE_ICON_COLOR: WorkspaceIconColor = "neutral";
const ICON_COLOR_KEY = "rumi-new-icon-color";
const PHOSPHOR_PREFIX = "ph:";
const IMAGE_ASSET_PATTERN = /^\.assets\/.+\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

export function parseWorkspaceIcon(value: string | null | undefined): WorkspaceIconValue | null {
  const icon = value?.trim();
  if (!icon) return null;

  if (icon.startsWith(PHOSPHOR_PREFIX)) {
    // `ph:<name>` or `ph:<name>:<color>`; an unknown color draws the icon uncolored.
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?::([a-z]+))?$/u.exec(icon.slice(PHOSPHOR_PREFIX.length));
    if (!match) return null;
    const color = workspaceIconColor(match[2]);
    return color && color !== DEFAULT_WORKSPACE_ICON_COLOR
      ? { type: "phosphor", name: match[1]!, color }
      : { type: "phosphor", name: match[1]! };
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

export function phosphorIconValue(name: string, color: WorkspaceIconColor = DEFAULT_WORKSPACE_ICON_COLOR): string {
  return color === DEFAULT_WORKSPACE_ICON_COLOR
    ? `${PHOSPHOR_PREFIX}${name}`
    : `${PHOSPHOR_PREFIX}${name}:${color}`;
}

export function workspaceIconColor(value: unknown): WorkspaceIconColor | null {
  return WORKSPACE_ICON_COLORS.find((color) => color.name === value)?.name ?? null;
}

/** CSS color of a colored Phosphor icon; undefined keeps the surrounding text color. */
export function workspaceIconColorHex(color: WorkspaceIconColor | undefined): string | undefined {
  return color ? WORKSPACE_ICON_COLORS.find((entry) => entry.name === color)?.hex : undefined;
}

/** The icon picker starts from the color this browser last chose. */
export function getSavedIconColor(): WorkspaceIconColor {
  try {
    return workspaceIconColor(localStorage.getItem(ICON_COLOR_KEY)) ?? DEFAULT_WORKSPACE_ICON_COLOR;
  } catch {
    return DEFAULT_WORKSPACE_ICON_COLOR;
  }
}

export function saveIconColor(color: WorkspaceIconColor): void {
  try {
    localStorage.setItem(ICON_COLOR_KEY, color);
  } catch {
    // Remembering the color is optional.
  }
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
let linkIcons = new Map<string, string | undefined>();
const listeners = new Set<Listener>();

/** App publishes the current tree; every surface reads item icons from here. */
export function publishWorkspaceIcons(tree: WorkspaceNode | null): void {
  if (tree === iconTree) return;
  iconTree = tree;
  iconsByPath = workspaceIconsByPath(tree);
  linkIcons = new Map();
  for (const listener of listeners) listener();
}

/** Icon of the workspace item an editor link points to, resolved like link navigation. */
export function workspaceIconForLink(href: string, sourceDocumentPath?: string | null): string | undefined {
  // Resolving walks the tree, so remember each answer until the tree changes.
  const key = `${sourceDocumentPath ?? ""}\u0000${href}`;
  if (linkIcons.has(key)) return linkIcons.get(key);
  const icon = resolveWorkspaceDocumentLink(iconTree, href, sourceDocumentPath)?.icon;
  const resolved = parseWorkspaceIcon(icon) ? icon : undefined;
  linkIcons.set(key, resolved);
  return resolved;
}

/** Icon of the item at a workspace node or companion path. */
export function workspaceIconForPath(path: string | null | undefined): string | undefined {
  return path ? iconsByPath.get(path) : undefined;
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

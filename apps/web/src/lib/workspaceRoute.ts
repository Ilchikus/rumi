import type { WorkspaceNode } from "@rumi/contracts";

export type WorkspaceRoute =
  | { view: "home" }
  | { view: "trash" }
  | { view: "node"; slugPath: string };

interface WorkspaceRouteEntry {
  node: WorkspaceNode;
  url: string;
}

export function workspaceUrlForNode(
  node: Pick<WorkspaceNode, "path" | "kind">,
  tree?: WorkspaceNode | null
): string {
  if (!isRoutableKind(node.kind)) return "/";

  const routedNode = tree
    ? buildWorkspaceRouteEntries(tree).find(
        (entry) => entry.node.path === node.path && entry.node.kind === node.kind
      )
    : null;
  if (routedNode) return routedNode.url;

  return `/${logicalPathSegmentsForNode(node).map(encodeSlugBase).join("/")}`;
}

export function parseWorkspaceRoute(pathname: string): WorkspaceRoute | null {
  const normalizedPathname = pathname !== "/" ? pathname.replace(/\/+$/u, "") : pathname;
  if (normalizedPathname === "/") return { view: "home" };
  if (normalizedPathname.toLowerCase() === "/trash") return { view: "trash" };

  const rawSegments = normalizedPathname.split("/").slice(1);
  if (rawSegments.length === 0) return null;
  const slugSegments: string[] = [];

  for (const rawSegment of rawSegments) {
    if (!rawSegment) return null;
    const decoded = decodeRouteSegment(rawSegment);
    if (!decoded || decoded === "." || decoded === ".." || /[/\\]/u.test(decoded)) return null;
    slugSegments.push(encodeSlugBase(decoded));
  }

  return { view: "node", slugPath: slugSegments.join("/") };
}

export function findWorkspaceNodeForRoute(
  tree: WorkspaceNode,
  route: WorkspaceRoute
): WorkspaceNode | null {
  if (route.view !== "node") return null;
  return buildWorkspaceRouteEntries(tree).find(
    (entry) => entry.url.slice(1) === route.slugPath
  )?.node ?? null;
}

function buildWorkspaceRouteEntries(tree: WorkspaceNode): WorkspaceRouteEntry[] {
  const entries: WorkspaceRouteEntry[] = [];

  const visit = (children: WorkspaceNode[], parentSegments: string[], isRoot: boolean) => {
    const routableChildren = children.filter((node) => isRoutableKind(node.kind));
    const segmentByNode = allocateSiblingSlugSegments(
      routableChildren,
      isRoot ? new Set(["trash"]) : new Set()
    );

    for (const node of routableChildren) {
      const segment = segmentByNode.get(node);
      if (!segment) continue;
      const routeSegments = [...parentSegments, segment];
      entries.push({ node, url: `/${routeSegments.join("/")}` });
      if (node.children?.length) visit(node.children, routeSegments, false);
    }
  };

  visit(tree.children ?? [], [], true);
  return entries;
}

function allocateSiblingSlugSegments(
  siblings: WorkspaceNode[],
  reservedSegments: Set<string>
): Map<WorkspaceNode, string> {
  const grouped = new Map<string, WorkspaceNode[]>();
  for (const node of siblings) {
    const base = encodeSlugBase(logicalSegmentForNode(node));
    const group = grouped.get(base) ?? [];
    group.push(node);
    grouped.set(base, group);
  }

  // Reserve every natural slug before assigning suffixes. This keeps a collision suffix from
  // stealing the clean URL of a real sibling such as "My Page 2".
  const naturalSegments = new Set(grouped.keys());
  const usedSegments = new Set(reservedSegments);
  const result = new Map<WorkspaceNode, string>();

  for (const base of [...grouped.keys()].sort(compareText)) {
    const nodes = grouped.get(base)!.sort(compareNodesForSlug);
    let nextNodeIndex = 0;

    if (!usedSegments.has(base)) {
      result.set(nodes[0]!, base);
      usedSegments.add(base);
      nextNodeIndex = 1;
    }

    let suffix = 2;
    for (let index = nextNodeIndex; index < nodes.length; index += 1) {
      let candidate = `${base}-${suffix}`;
      while (naturalSegments.has(candidate) || usedSegments.has(candidate)) {
        suffix += 1;
        candidate = `${base}-${suffix}`;
      }
      result.set(nodes[index]!, candidate);
      usedSegments.add(candidate);
      suffix += 1;
    }
  }

  return result;
}

function logicalPathSegmentsForNode(node: Pick<WorkspaceNode, "path" | "kind">): string[] {
  const segments = node.path.split("/");
  const lastIndex = segments.length - 1;
  if (node.kind === "page" && segments[lastIndex]?.toLowerCase().endsWith(".md")) {
    segments[lastIndex] = segments[lastIndex]!.slice(0, -3);
  }
  return segments;
}

function logicalSegmentForNode(node: WorkspaceNode): string {
  return logicalPathSegmentsForNode(node).at(-1) ?? node.name;
}

function encodeSlugBase(segment: string): string {
  const normalized = segment.trim().toLowerCase().replace(/\s+/gu, "-");
  return encodeURIComponent(normalized || "item");
}

function decodeRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

function compareNodesForSlug(left: WorkspaceNode, right: WorkspaceNode): number {
  const leftDirectoryRank = left.kind === "page" ? 1 : 0;
  const rightDirectoryRank = right.kind === "page" ? 1 : 0;
  if (leftDirectoryRank !== rightDirectoryRank) return leftDirectoryRank - rightDirectoryRank;

  const leftWhitespaceRank = /\s/u.test(logicalSegmentForNode(left)) ? 0 : 1;
  const rightWhitespaceRank = /\s/u.test(logicalSegmentForNode(right)) ? 0 : 1;
  if (leftWhitespaceRank !== rightWhitespaceRank) return leftWhitespaceRank - rightWhitespaceRank;

  return compareText(left.path, right.path);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRoutableKind(kind: string | undefined): kind is "page" | "folder" | "database" {
  return kind === "page" || kind === "folder" || kind === "database";
}

import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  pinnedItemsStorageKey,
  projectPinnedWorkspaceNodes,
  readPinnedItemPaths,
  replacePinnedItemPath,
  resolvePinnedItemPaths,
  setPinnedItemPath,
  writePinnedItemPaths,
  type PinnedItemStorage
} from "./pinnedItems";

const tree: WorkspaceNode = {
  path: "",
  name: "Notes",
  kind: "workspace",
  companionPath: "Notes.index.md",
  children: [
    { path: "Loose.md", name: "Loose.md", kind: "page" },
    {
      path: "Projects",
      name: "Projects",
      kind: "folder",
      companionPath: "Projects/Projects.index.md",
      children: [{
        path: "Projects/Plans",
        name: "Plans",
        kind: "folder",
        children: [{ path: "Projects/Plans/Launch.md", name: "Launch.md", kind: "page" }]
      }]
    },
    {
      path: "Tasks",
      name: "Tasks",
      kind: "database",
      companionPath: "Tasks/Tasks.db.md",
      children: [{ path: "Tasks/First.md", name: "First.md", kind: "page" }]
    },
    { path: ".assets/photo.png", name: "photo.png", kind: "asset" }
  ]
};

describe("pinned workspace items", () => {
  it("round-trips ordered, deduplicated paths per workspace", () => {
    const storage = memoryStorage();
    writePinnedItemPaths(storage, "/one", ["Projects", "Loose.md", "Projects"]);
    writePinnedItemPaths(storage, "/two", ["Tasks"]);

    expect(readPinnedItemPaths(storage, "/one")).toEqual(["Projects", "Loose.md"]);
    expect(readPinnedItemPaths(storage, "/two")).toEqual(["Tasks"]);
    expect(storage.getItem(pinnedItemsStorageKey("/one"))).toBe(
      JSON.stringify(["Projects", "Loose.md"])
    );
  });

  it("ignores malformed entries without blocking navigation", () => {
    const storage = memoryStorage();
    storage.setItem(pinnedItemsStorageKey("/broken"), "{");
    storage.setItem(pinnedItemsStorageKey("/mixed"), JSON.stringify([
      "Loose.md",
      null,
      12,
      "Loose.md",
      ""
    ]));

    expect(readPinnedItemPaths(storage, "/broken")).toEqual([]);
    expect(readPinnedItemPaths(storage, "/mixed")).toEqual(["Loose.md"]);
  });

  it("pins and unpins without disturbing stable insertion order", () => {
    expect(setPinnedItemPath(["Projects"], "Loose.md", true)).toEqual([
      "Projects",
      "Loose.md"
    ]);
    expect(setPinnedItemPath(["Projects", "Loose.md"], "Projects", true)).toEqual([
      "Projects",
      "Loose.md"
    ]);
    expect(setPinnedItemPath(["Projects", "Loose.md"], "Projects", false)).toEqual([
      "Loose.md"
    ]);
  });

  it("repairs a renamed or moved pinned subtree and removes collisions", () => {
    expect(replacePinnedItemPath(
      ["Archive/Projects", "Projects", "Projects/Plans/Launch.md"],
      "Projects",
      "Archive/Projects"
    )).toEqual(["Archive/Projects", "Archive/Projects/Plans/Launch.md"]);
  });

  it("prunes missing, root, asset, and generic-file paths", () => {
    expect(resolvePinnedItemPaths(tree, [
      "",
      "Missing.md",
      ".assets/photo.png",
      "Loose.md",
      "Tasks",
      "Tasks/First.md"
    ])).toEqual(["Loose.md", "Tasks", "Tasks/First.md"]);
  });

  it("keeps lone leaves flat and nests nodes beneath their nearest pinned ancestor", () => {
    const projected = projectPinnedWorkspaceNodes(tree, [
      "Projects",
      "Projects/Plans/Launch.md",
      "Loose.md",
      "Tasks/First.md",
      "Tasks"
    ]);

    expect(paths(projected)).toEqual([
      ["Projects", 0],
      ["Projects/Plans/Launch.md", 1],
      ["Loose.md", 0],
      ["Tasks", 0],
      ["Tasks/First.md", 1]
    ]);
    expect(projected[0]?.children?.map((node) => node.path)).toEqual([
      "Projects/Plans/Launch.md"
    ]);
  });

  it("skips unpinned ancestors while retaining the nearest pinned hierarchy", () => {
    const projected = projectPinnedWorkspaceNodes(tree, [
      "Projects/Plans/Launch.md",
      "Projects/Plans"
    ]);
    expect(paths(projected)).toEqual([
      ["Projects/Plans", 0],
      ["Projects/Plans/Launch.md", 1]
    ]);

    expect(paths(projectPinnedWorkspaceNodes(tree, ["Projects/Plans/Launch.md"]))).toEqual([
      ["Projects/Plans/Launch.md", 0]
    ]);
  });
});

function paths(nodes: readonly WorkspaceNode[], depth = 0): Array<[string, number]> {
  return nodes.flatMap((node) => [
    [node.path, depth] as [string, number],
    ...paths(node.children ?? [], depth + 1)
  ]);
}

function memoryStorage(): PinnedItemStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

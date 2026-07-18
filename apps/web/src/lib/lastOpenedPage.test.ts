import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  clearLastOpenedPage,
  findWorkspaceNode,
  readLastOpenedPage,
  writeLastOpenedPage,
  type LastOpenedPageStorage
} from "./lastOpenedPage";

describe("last opened page persistence", () => {
  it("stores the logical selection separately for each workspace", () => {
    const storage = memoryStorage();
    const selection = {
      nodePath: "Projects",
      openPath: "Projects/Projects.index.md",
      kind: "folder" as const
    };

    writeLastOpenedPage(storage, "/workspaces/one", selection);

    expect(readLastOpenedPage(storage, "/workspaces/one")).toEqual(selection);
    expect(readLastOpenedPage(storage, "/workspaces/two")).toBeNull();

    clearLastOpenedPage(storage, "/workspaces/one");
    expect(readLastOpenedPage(storage, "/workspaces/one")).toBeNull();
  });

  it("rejects malformed or non-page selections", () => {
    const storage = memoryStorage();
    storage.setItem("rumi-new-last-opened-page:/workspace", JSON.stringify({ nodePath: "", kind: "asset" }));

    expect(readLastOpenedPage(storage, "/workspace")).toBeNull();
  });

  it("finds a persisted logical node in a nested workspace tree", () => {
    const page: WorkspaceNode = { path: "Projects/Idea.md", name: "Idea.md", kind: "page" };
    const tree: WorkspaceNode = {
      path: "",
      name: "Workspace",
      kind: "workspace",
      children: [
        {
          path: "Projects",
          name: "Projects",
          kind: "folder",
          companionPath: "Projects/Projects.index.md",
          children: [page]
        }
      ]
    };

    expect(findWorkspaceNode(tree, page.path)).toBe(page);
    expect(findWorkspaceNode(tree, "Missing.md")).toBeNull();
  });
});

function memoryStorage(): LastOpenedPageStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

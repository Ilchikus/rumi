import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { insertOptimisticWorkspacePage } from "./optimisticWorkspaceTree";

describe("optimistic workspace tree pages", () => {
  it("adds a root page immediately in runtime tree order", () => {
    const tree: WorkspaceNode = {
      path: "",
      name: "Workspace",
      kind: "workspace",
      children: [
        { path: "Projects", name: "Projects", kind: "folder", children: [] },
        { path: "Zebra.md", name: "Zebra.md", kind: "page" }
      ]
    };

    const nextTree = insertOptimisticWorkspacePage(tree, "Alpha.md");

    expect(nextTree.children).toEqual([
      tree.children?.[0],
      { path: "Alpha.md", name: "Alpha.md", kind: "page" },
      tree.children?.[1]
    ]);
  });

  it("adds a record to its database without changing unrelated branches", () => {
    const archive: WorkspaceNode = {
      path: "Archive",
      name: "Archive",
      kind: "folder",
      children: []
    };
    const database: WorkspaceNode = {
      path: "Projects",
      name: "Projects",
      kind: "database",
      companionPath: "Projects/Projects.db.md",
      children: [
        { path: "Projects/Zebra.md", name: "Zebra.md", kind: "page" }
      ]
    };
    const tree: WorkspaceNode = {
      path: "",
      name: "Workspace",
      kind: "workspace",
      children: [archive, database]
    };

    const nextTree = insertOptimisticWorkspacePage(tree, "Projects/Alpha.md");
    const nextDatabase = nextTree.children?.[1];

    expect(nextTree).not.toBe(tree);
    expect(nextTree.children?.[0]).toBe(archive);
    expect(nextDatabase).not.toBe(database);
    expect(nextDatabase?.companionPath).toBe(database.companionPath);
    expect(nextDatabase?.children).toEqual([
      { path: "Projects/Alpha.md", name: "Alpha.md", kind: "page" },
      database.children?.[0]
    ]);
  });

  it("does not duplicate a page already supplied by a concurrent refresh", () => {
    const page: WorkspaceNode = {
      path: "Projects/New Page.md",
      name: "New Page.md",
      kind: "page"
    };
    const tree: WorkspaceNode = {
      path: "",
      name: "Workspace",
      kind: "workspace",
      children: [
        {
          path: "Projects",
          name: "Projects",
          kind: "database",
          children: [page]
        }
      ]
    };

    expect(insertOptimisticWorkspacePage(tree, page.path)).toBe(tree);
  });

  it("leaves the tree unchanged when the parent is not loaded", () => {
    const tree: WorkspaceNode = {
      path: "",
      name: "Workspace",
      kind: "workspace",
      children: []
    };

    expect(insertOptimisticWorkspacePage(tree, "Missing/New Page.md")).toBe(tree);
  });
});

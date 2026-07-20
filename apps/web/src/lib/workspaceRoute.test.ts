import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  findWorkspaceNodeForRoute,
  parseWorkspaceRoute,
  workspaceUrlForNode
} from "./workspaceRoute";

const tree: WorkspaceNode = {
  path: "",
  name: "Workspace",
  kind: "workspace",
  children: [
    { path: "My Page.md", name: "My Page.md", kind: "page" },
    { path: "My-Page.md", name: "My-Page.md", kind: "page" },
    { path: "My_Page.md", name: "My_Page.md", kind: "page" },
    { path: "Collision.md", name: "Collision.md", kind: "page" },
    {
      path: "Collision",
      name: "Collision",
      kind: "folder",
      companionPath: "Collision/Collision.index.md"
    },
    {
      path: "Project Files",
      name: "Project Files",
      kind: "folder",
      companionPath: "Project Files/Project Files.index.md",
      children: [
        { path: "Project Files/Résumé.md", name: "Résumé.md", kind: "page" }
      ]
    },
    {
      path: "Tasks",
      name: "Tasks",
      kind: "database",
      companionPath: "Tasks/Tasks.db.md",
      children: [
        { path: "Tasks/My Task.md", name: "My Task.md", kind: "page" }
      ]
    },
    {
      path: "trash",
      name: "trash",
      kind: "folder",
      companionPath: "trash/trash.index.md"
    },
    {
      path: "Project-Files",
      name: "Project-Files",
      kind: "folder",
      companionPath: "Project-Files/Project-Files.index.md",
      children: [
        { path: "Project-Files/Résumé.md", name: "Résumé.md", kind: "page" }
      ]
    }
  ]
};

describe("workspace browser routes", () => {
  it("uses lowercase single-hyphen slugs without type prefixes or Markdown extensions", () => {
    expect(workspaceUrlForNode(tree.children![0]!, tree)).toBe("/my-page");
    expect(workspaceUrlForNode(tree.children![1]!, tree)).toBe("/my-page-2");
    expect(workspaceUrlForNode(tree.children![2]!, tree)).toBe("/my_page");
    expect(workspaceUrlForNode(tree.children![5]!, tree)).toBe("/project-files");
    expect(workspaceUrlForNode(tree.children![6]!, tree)).toBe("/tasks");
    expect(workspaceUrlForNode(tree.children![6]!.children![0]!, tree)).toBe("/tasks/my-task");
  });

  it("round-trips nested and Unicode page paths", () => {
    const node = tree.children![5]!.children![0]!;
    const url = workspaceUrlForNode(node, tree);
    const route = parseWorkspaceRoute(url);

    expect(url).toBe("/project-files/r%C3%A9sum%C3%A9");
    expect(route).toEqual({ view: "node", slugPath: "project-files/r%C3%A9sum%C3%A9" });
    expect(route && findWorkspaceNodeForRoute(tree, route)).toBe(node);
  });

  it("applies collision suffixes at the sibling level so nested URLs keep their parent", () => {
    const folder = tree.children![8]!;
    const page = folder.children![0]!;
    expect(workspaceUrlForNode(folder, tree)).toBe("/project-files-2");
    expect(workspaceUrlForNode(page, tree)).toBe("/project-files-2/r%C3%A9sum%C3%A9");
    expect(findWorkspaceNodeForRoute(tree, parseWorkspaceRoute("/project-files-2")!)).toBe(folder);
  });

  it("disambiguates a page from a same-named directory without exposing .md", () => {
    const page = tree.children![3]!;
    const folder = tree.children![4]!;
    expect(workspaceUrlForNode(folder, tree)).toBe("/collision");
    expect(workspaceUrlForNode(page, tree)).toBe("/collision-2");
    expect(findWorkspaceNodeForRoute(tree, parseWorkspaceRoute("/collision")!)).toBe(folder);
    expect(findWorkspaceNodeForRoute(tree, parseWorkspaceRoute("/collision-2")!)).toBe(page);
  });

  it("keeps application Trash distinct from a workspace item named trash", () => {
    const workspaceTrash = tree.children![7]!;
    expect(parseWorkspaceRoute("/trash")).toEqual({ view: "trash" });
    expect(workspaceUrlForNode(workspaceTrash, tree)).toBe("/trash-2");
    const route = parseWorkspaceRoute("/trash-2");
    expect(route).toEqual({ view: "node", slugPath: "trash-2" });
    expect(route && findWorkspaceNodeForRoute(tree, route)).toBe(workspaceTrash);
  });

  it("normalizes incoming case and escaped spaces and rejects invalid paths", () => {
    expect(parseWorkspaceRoute("/")).toEqual({ view: "home" });
    expect(workspaceUrlForNode(tree, tree)).toBe("/");
    expect(parseWorkspaceRoute("/MY%20PAGE")).toEqual({
      view: "node",
      slugPath: "my-page"
    });
    expect(parseWorkspaceRoute("/TRASH")).toEqual({ view: "trash" });
    expect(parseWorkspaceRoute("/%2E%2E")).toBeNull();
  });

  it("avoids stealing a natural numeric slug while resolving case collisions", () => {
    const collisionTree: WorkspaceNode = {
      path: "",
      name: "Workspace",
      kind: "workspace",
      children: [
        { path: "My Page.md", name: "My Page.md", kind: "page" },
        { path: "My-Page.md", name: "My-Page.md", kind: "page" },
        { path: "My Page 2.md", name: "My Page 2.md", kind: "page" },
        { path: "Report.md", name: "Report.md", kind: "page" },
        { path: "report.md", name: "report.md", kind: "page" }
      ]
    };

    expect(workspaceUrlForNode(collisionTree.children![0]!, collisionTree)).toBe("/my-page");
    expect(workspaceUrlForNode(collisionTree.children![2]!, collisionTree)).toBe("/my-page-2");
    expect(workspaceUrlForNode(collisionTree.children![1]!, collisionTree)).toBe("/my-page-3");
    expect(workspaceUrlForNode(collisionTree.children![3]!, collisionTree)).toBe("/report");
    expect(workspaceUrlForNode(collisionTree.children![4]!, collisionTree)).toBe("/report-2");
  });
});

import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { rememberVisitedPath, takePreviousVisitedNode } from "./pageVisitHistory";

const tree: WorkspaceNode = {
  name: "Workspace",
  path: "",
  kind: "workspace",
  children: [
    { name: "First", path: "First.md", kind: "page" },
    {
      name: "Folder",
      path: "Folder",
      kind: "folder",
      children: [
        { name: "Nested", path: "Folder/Nested.md", kind: "page" }
      ]
    },
    {
      name: "Tasks",
      path: "Tasks",
      kind: "database",
      companionPath: "Tasks/Tasks.db.md",
      children: [
        { name: "Current", path: "Tasks/Current.md", kind: "page" },
        { name: "Older", path: "Tasks/Older.md", kind: "page" }
      ]
    },
    { name: "Previous", path: "Previous.md", kind: "page" }
  ]
};

describe("page visit history", () => {
  it("records the page being left without duplicating the current route", () => {
    expect(rememberVisitedPath([], "First.md", "Previous.md")).toEqual(["First.md"]);
    expect(rememberVisitedPath(["First.md"], "Previous.md", "Previous.md")).toEqual(["First.md"]);
  });

  it("returns the latest existing page outside the deleted subtree", () => {
    expect(
      takePreviousVisitedNode(
        ["Previous.md", "Folder/Nested.md", "Missing.md"],
        tree,
        "Folder"
      )
    ).toEqual({
      history: [],
      node: tree.children![3]
    });
  });

  it("returns the previous ordinary page after deleting an open database record", () => {
    expect(
      takePreviousVisitedNode(["Previous.md"], tree, "Tasks/Current.md")
    ).toEqual({
      history: [],
      node: tree.children![3]
    });
  });

  it("skips visited records inside a deleted database subtree", () => {
    expect(
      takePreviousVisitedNode(
        ["Previous.md", "Tasks/Older.md", "Tasks/Current.md"],
        tree,
        "Tasks"
      )
    ).toEqual({
      history: [],
      node: tree.children![3]
    });
  });

  it("falls back only after every visited candidate is missing or deleted", () => {
    expect(
      takePreviousVisitedNode(
        ["Missing.md", "Tasks/Older.md"],
        tree,
        "Tasks"
      )
    ).toEqual({ history: [], node: null });
  });
});

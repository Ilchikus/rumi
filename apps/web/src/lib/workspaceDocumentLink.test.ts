import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { resolveWorkspaceDocumentLink } from "./workspaceDocumentLink";

const innerFolder: WorkspaceNode = {
  path: "test folder/Renamed Inner",
  name: "Renamed Inner",
  kind: "folder",
  companionPath: "test folder/Renamed Inner/Renamed Inner.index.md"
};

const tree: WorkspaceNode = {
  path: "",
  name: "Workspace",
  kind: "workspace",
  children: [
    {
      path: "test folder",
      name: "test folder",
      kind: "folder",
      companionPath: "test folder/test folder.index.md",
      children: [
        innerFolder,
        { path: "test folder/Reference.md", name: "Reference.md", kind: "page" }
      ]
    },
    { path: "Root Page.md", name: "Root Page.md", kind: "page" }
  ]
};

describe("workspace document links", () => {
  it("decodes URI-safe workspace paths before matching canonical filenames", () => {
    expect(resolveWorkspaceDocumentLink(
      tree,
      "test%20folder/Renamed%20Inner/Renamed%20Inner.index.md",
      "test folder/Reference.md"
    )).toBe(innerFolder);
  });

  it("resolves standard relative Markdown paths from the containing document", () => {
    expect(resolveWorkspaceDocumentLink(
      tree,
      "Renamed%20Inner/Renamed%20Inner.index.md#details",
      "test folder/Reference.md"
    )).toBe(innerFolder);
    expect(resolveWorkspaceDocumentLink(
      tree,
      "../Root%20Page.md",
      "test folder/Reference.md"
    )?.path).toBe("Root Page.md");
  });

  it("maps application slugs back to their workspace node", () => {
    expect(resolveWorkspaceDocumentLink(
      tree,
      "/test-folder/renamed-inner",
      "test folder/Reference.md"
    )).toBe(innerFolder);
  });

  it("prefers an exact canonical path over a colliding application slug", () => {
    const canonicalNode: WorkspaceNode = {
      path: "my-page",
      name: "my-page",
      kind: "folder",
      companionPath: "my-page/my-page.index.md"
    };
    const collisionTree: WorkspaceNode = {
      path: "",
      name: "Workspace",
      kind: "workspace",
      children: [
        {
          path: "My Page",
          name: "My Page",
          kind: "folder",
          companionPath: "My Page/My Page.index.md"
        },
        canonicalNode
      ]
    };

    expect(resolveWorkspaceDocumentLink(collisionTree, "/my-page")).toBe(canonicalNode);
  });

  it("rejects external, malformed, and escaping destinations", () => {
    expect(resolveWorkspaceDocumentLink(tree, "https://example.com/page")).toBeNull();
    expect(resolveWorkspaceDocumentLink(tree, "Bad%2")).toBeNull();
    expect(resolveWorkspaceDocumentLink(tree, "../../Root%20Page.md", "test folder/Reference.md"))
      .toBeNull();
  });
});

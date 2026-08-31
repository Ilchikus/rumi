import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  findWorkspaceDocumentNode,
  MAX_RECENT_DOCUMENTS,
  readRecentDocuments,
  recordRecentDocument,
  replaceRecentDocumentPath,
  resolveRecentDocuments,
  type RecentDocumentStorage
} from "./recentDocuments";

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
      children: [
        { path: "Projects/Plan.md", name: "Plan.md", kind: "page" }
      ]
    },
    {
      path: "Tasks",
      name: "Tasks",
      kind: "database",
      companionPath: "Tasks/Tasks.db.md",
      children: [
        { path: "Tasks/First.md", name: "First.md", kind: "page" }
      ]
    },
    { path: ".assets/photo.png", name: "photo.png", kind: "asset" },
    { path: "Archive", name: "Archive", kind: "folder" }
  ]
};

describe("recent workspace documents", () => {
  it("keeps independent newest-first, deduplicated histories per workspace", () => {
    const storage = memoryStorage();
    const loose = tree.children![0]!;
    const projects = tree.children![1]!;

    recordRecentDocument(storage, "/workspaces/one", loose);
    recordRecentDocument(storage, "/workspaces/one", projects);
    recordRecentDocument(storage, "/workspaces/one", loose);
    recordRecentDocument(storage, "/workspaces/two", projects);

    expect(readRecentDocuments(storage, "/workspaces/one")).toEqual([
      { nodePath: "Loose.md", kind: "page" },
      { nodePath: "Projects", kind: "folder" }
    ]);
    expect(readRecentDocuments(storage, "/workspaces/two")).toEqual([
      { nodePath: "Projects", kind: "folder" }
    ]);
  });

  it("bounds history to fifty documents", () => {
    const storage = memoryStorage();

    for (let index = 0; index < MAX_RECENT_DOCUMENTS + 8; index += 1) {
      recordRecentDocument(storage, "/workspace", {
        path: `Page ${index}.md`,
        kind: "page"
      });
    }

    const records = readRecentDocuments(storage, "/workspace");
    expect(records).toHaveLength(MAX_RECENT_DOCUMENTS);
    expect(records[0]?.nodePath).toBe("Page 57.md");
    expect(records.at(-1)?.nodePath).toBe("Page 8.md");
  });

  it("ignores invalid storage entries and non-document nodes", () => {
    const storage = memoryStorage();
    storage.setItem("rumi-new-recent-documents:v1:/bad-json", "{");
    storage.setItem("rumi-new-recent-documents:v1:/bad-shape", JSON.stringify([
      null,
      { nodePath: "Asset.png", kind: "asset" },
      { nodePath: "", kind: "page" },
      { nodePath: "Valid.md", kind: "page" }
    ]));

    recordRecentDocument(storage, "/documents", tree.children![3]!);
    recordRecentDocument(storage, "/documents", tree.children![4]!);

    expect(readRecentDocuments(storage, "/bad-json")).toEqual([]);
    expect(readRecentDocuments(storage, "/bad-shape")).toEqual([
      { nodePath: "Valid.md", kind: "page" }
    ]);
    expect(readRecentDocuments(storage, "/documents")).toEqual([]);
  });

  it("replaces renamed or moved paths throughout a subtree and removes collisions", () => {
    const storage = memoryStorage();
    recordRecentDocument(storage, "/workspace", tree.children![0]!);
    recordRecentDocument(storage, "/workspace", tree.children![1]!.children![0]!);
    recordRecentDocument(storage, "/workspace", tree.children![1]!);

    replaceRecentDocumentPath(storage, "/workspace", "Projects", "Archive/Projects");
    expect(readRecentDocuments(storage, "/workspace")).toEqual([
      { nodePath: "Archive/Projects", kind: "folder" },
      { nodePath: "Archive/Projects/Plan.md", kind: "page" },
      { nodePath: "Loose.md", kind: "page" }
    ]);

    replaceRecentDocumentPath(storage, "/workspace", "Archive/Projects/Plan.md", "Loose.md");
    expect(readRecentDocuments(storage, "/workspace")).toEqual([
      { nodePath: "Archive/Projects", kind: "folder" },
      { nodePath: "Loose.md", kind: "page" }
    ]);
  });

  it("resolves current tree metadata and prunes missing paths", () => {
    const storage = memoryStorage();
    recordRecentDocument(storage, "/workspace", { path: "Missing.md", kind: "page" });
    recordRecentDocument(storage, "/workspace", tree.children![2]!);
    recordRecentDocument(storage, "/workspace", tree.children![1]!.children![0]!);
    recordRecentDocument(storage, "/workspace", tree);

    expect(resolveRecentDocuments(storage, "/workspace", tree)).toEqual([
      {
        nodePath: "",
        path: "Notes.index.md",
        title: "Notes",
        kind: "folder",
        snippet: "",
        score: 0
      },
      {
        nodePath: "Projects/Plan.md",
        path: "Projects/Plan.md",
        title: "Plan",
        kind: "page",
        snippet: "",
        score: 0
      },
      {
        nodePath: "Tasks",
        path: "Tasks/Tasks.db.md",
        title: "Tasks",
        kind: "database",
        snippet: "",
        score: 0
      }
    ]);
    expect(readRecentDocuments(storage, "/workspace")).toEqual([
      { nodePath: "", kind: "workspace" },
      { nodePath: "Projects/Plan.md", kind: "page" },
      { nodePath: "Tasks", kind: "database" }
    ]);
  });

  it("finds canonical nodes by their openable companion paths", () => {
    expect(findWorkspaceDocumentNode(tree, "Notes.index.md")).toBe(tree);
    expect(findWorkspaceDocumentNode(tree, "Projects/Projects.index.md")).toBe(tree.children![1]);
    expect(findWorkspaceDocumentNode(tree, "Tasks/First.md")).toBe(tree.children![2]!.children![0]);
    expect(findWorkspaceDocumentNode(tree, "Missing.md")).toBeNull();
  });
});

function memoryStorage(): RecentDocumentStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

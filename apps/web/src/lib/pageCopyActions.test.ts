import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  pageCopyValue,
  workspaceNodeCopyValue,
  workspaceNodeRelativePath
} from "./pageCopyActions";

describe("current-page copy values", () => {
  it("builds an absolute URL from the canonical application route", () => {
    expect(pageCopyValue("url", {
      origin: "https://notes.example.test:8443",
      route: "/projects/launch-plan",
      relativePath: "Projects/Launch plan.md"
    })).toBe("https://notes.example.test:8443/projects/launch-plan");
  });

  it("copies the canonical workspace-root-relative Markdown path", () => {
    expect(pageCopyValue("relative-path", {
      origin: "https://notes.example.test",
      route: "/projects/launch-plan",
      relativePath: "Projects/Launch plan.md"
    })).toBe("/Projects/Launch plan.md");
  });

  it("does not duplicate an existing workspace-root slash", () => {
    expect(pageCopyValue("relative-path", {
      origin: "https://notes.example.test",
      route: "/projects/launch-plan",
      relativePath: "/Projects/Launch plan.md"
    })).toBe("/Projects/Launch plan.md");
  });
});

describe("workspace-item copy values", () => {
  const collisionPage: WorkspaceNode = {
    path: "Project Files/Résumé.md",
    name: "Résumé.md",
    kind: "page"
  };
  const folder: WorkspaceNode = {
    path: "Project Files",
    name: "Project Files",
    kind: "folder",
    companionPath: "Project Files/Project Files.index.md",
    children: [collisionPage]
  };
  const database: WorkspaceNode = {
    path: "Tasks",
    name: "Tasks",
    kind: "database",
    companionPath: "Tasks/Tasks.db.md"
  };
  const tree: WorkspaceNode = {
    path: "",
    name: "Notes",
    kind: "workspace",
    companionPath: "Notes.index.md",
    children: [
      { path: "Project Files.md", name: "Project Files.md", kind: "page" },
      folder,
      database
    ]
  };

  it("uses collision-safe encoded application routes for page URLs", () => {
    expect(workspaceNodeCopyValue("url", {
      origin: "https://notes.example.test:8443",
      node: collisionPage,
      tree
    })).toBe("https://notes.example.test:8443/project-files/r%C3%A9sum%C3%A9");
    expect(workspaceNodeCopyValue("url", {
      origin: "https://notes.example.test:8443",
      node: tree.children![0]!,
      tree
    })).toBe("https://notes.example.test:8443/project-files-2");
  });

  it("prefers folder, database, and root Markdown companions for relative paths", () => {
    expect(workspaceNodeRelativePath(folder)).toBe("Project Files/Project Files.index.md");
    expect(workspaceNodeRelativePath(database)).toBe("Tasks/Tasks.db.md");
    expect(workspaceNodeCopyValue("relative-path", {
      origin: "https://notes.example.test",
      node: tree,
      tree
    })).toBe("/Notes.index.md");
    expect(workspaceNodeCopyValue("url", {
      origin: "https://notes.example.test",
      node: tree,
      tree
    })).toBe("https://notes.example.test/");
    expect(workspaceNodeCopyValue("url", {
      origin: "https://notes.example.test",
      node: database,
      tree
    })).toBe("https://notes.example.test/tasks");
  });

  it("copies an ordinary page path and omits copy values for a root without a companion", () => {
    expect(workspaceNodeCopyValue("relative-path", {
      origin: "https://notes.example.test",
      node: collisionPage,
      tree
    })).toBe("/Project Files/Résumé.md");
    const { companionPath: _companionPath, ...rootWithoutCompanion } = tree;
    expect(workspaceNodeCopyValue("url", {
      origin: "https://notes.example.test",
      node: rootWithoutCompanion,
      tree
    })).toBeNull();
  });
});

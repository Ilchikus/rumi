import { describe, expect, it } from "vitest";
import {
  classifyFilePath,
  cleanWorkspaceName,
  databaseConfigPathForDirectory,
  folderIndexPathForDirectory,
  isHiddenFromTree,
  normalizeWorkspacePath,
  sanitizeWorkspaceName
} from "./index";

describe("workspace format", () => {
  it("normalizes portable workspace paths", () => {
    expect(normalizeWorkspacePath("Projects\\Idea.md")).toBe("Projects/Idea.md");
    expect(normalizeWorkspacePath("./Projects/../Ideas/Page.md")).toBe("Ideas/Page.md");
  });

  it("rejects paths that escape the workspace", () => {
    expect(() => normalizeWorkspacePath("../outside.md")).toThrow(/escapes root/);
    expect(() => normalizeWorkspacePath("/tmp/outside.md")).toThrow(/relative/);
  });

  it("detects folder and database companion files", () => {
    expect(folderIndexPathForDirectory("Projects")).toBe("Projects/Projects.index.md");
    expect(databaseConfigPathForDirectory("Tasks")).toBe("Tasks/Tasks.db.md");
    expect(classifyFilePath("Projects/Projects.index.md")).toBe("folder-index");
    expect(classifyFilePath("Tasks/Tasks.db.md")).toBe("database-config");
  });

  it("classifies pages, assets, and internal paths", () => {
    expect(classifyFilePath("Notes/Idea.md")).toBe("page");
    expect(classifyFilePath(".assets/photo.jpg")).toBe("asset");
    expect(classifyFilePath(".rumi/index.json")).toBe("internal");
    expect(classifyFilePath("node_modules/react/index.js")).toBe("internal");
    expect(isHiddenFromTree(".rumi/index.json")).toBe(true);
    expect(isHiddenFromTree(".assets/photo.jpg")).toBe(true);
    expect(isHiddenFromTree("node_modules/react/index.js")).toBe(true);
    expect(isHiddenFromTree("package.json")).toBe(true);
    expect(isHiddenFromTree("package-lock.json")).toBe(true);
    expect(isHiddenFromTree("Notes/package.json")).toBe(true);
  });

  it("sanitizes portable workspace names", () => {
    expect(sanitizeWorkspaceName("test/page").sanitized).toBe("test⧸page");
    expect(sanitizeWorkspaceName("My--Page").sanitized).toBe("My--Page");
    expect(sanitizeWorkspaceName("dash-name_under_score").sanitized).toBe("dash-name_under_score");
    expect(sanitizeWorkspaceName("bad:name?.md")).toMatchObject({
      sanitized: "bad name .md",
      replacedUnsafeChars: true
    });
    expect(cleanWorkspaceName(" test/page ")).toBe("test⧸page");
    expect(() => cleanWorkspaceName("   ")).toThrow(/required/);
    expect(() => cleanWorkspaceName("..")).toThrow(/reserved/);
  });
});

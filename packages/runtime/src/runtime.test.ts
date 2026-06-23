import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RumiEventEnvelope } from "@rumi/contracts";
import { createTempWorkspace, WorkspaceRuntime } from "./index";

const cleanupPaths: string[] = [];

afterEach(async () => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    await fs.rm(cleanupPath, { recursive: true, force: true });
  }
});

describe("WorkspaceRuntime", () => {
  it("opens a workspace directory", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    expect(runtime.info()).toEqual({
      rootPath: root,
      name: path.basename(root)
    });
  });

  it("rejects missing roots and files as roots", async () => {
    const root = await tempWorkspace();
    const filePath = path.join(root, "not-root.md");
    await fs.writeFile(filePath, "Body", "utf8");

    await expect(WorkspaceRuntime.open({ rootPath: path.join(root, "missing") })).rejects.toThrow(
      /does not exist/
    );
    await expect(WorkspaceRuntime.open({ rootPath: filePath })).rejects.toThrow(/must be a directory/);
  });

  it("reads a tree and hides Rumi internals", async () => {
    const root = await tempWorkspace();
    await fs.mkdir(path.join(root, "Projects"), { recursive: true });
    await fs.mkdir(path.join(root, ".rumi"), { recursive: true });
    await fs.writeFile(path.join(root, "Projects", "Projects.index.md"), "# Projects", "utf8");
    await fs.writeFile(path.join(root, "Projects", "Idea.md"), "# Idea", "utf8");
    await fs.writeFile(path.join(root, ".rumi", "index.sqlite"), "", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const tree = await runtime.getTree();

    expect(tree.kind).toBe("workspace");
    expect(tree.children?.map((child) => child.name)).toEqual(["Projects"]);
    expect(tree.children?.[0]).toMatchObject({
      name: "Projects",
      kind: "folder",
      companionPath: "Projects/Projects.index.md"
    });
    expect(tree.children?.[0]?.children?.map((child) => child.name)).toEqual(["Idea.md"]);
  });

  it("opens a page with frontmatter, body, and hashes", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Idea.md"), "---\nstatus: ready\n---\n# Idea", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const page = await runtime.openPage("Idea.md");

    expect(page).toMatchObject({
      path: "Idea.md",
      kind: "page",
      frontmatter: { status: "ready" },
      markdownBody: "# Idea"
    });
    expect(page.version).toHaveLength(64);
    expect(page.contentHash).toBe(page.version);
    expect(page.frontmatterHash).toHaveLength(64);
  });

  it("opens a folder through its index companion", async () => {
    const root = await tempWorkspace();
    await fs.mkdir(path.join(root, "Projects"), { recursive: true });
    await fs.writeFile(path.join(root, "Projects", "Projects.index.md"), "# Projects", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const page = await runtime.openPage("Projects");

    expect(page).toMatchObject({
      path: "Projects/Projects.index.md",
      kind: "folder",
      markdownBody: "# Projects"
    });
  });

  it("saves a page and preserves frontmatter/body structure", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Idea.md"), "---\nstatus: ready\n---\n# Idea", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const page = await runtime.openPage("Idea.md");
    const result = await runtime.savePage({
      path: page.path,
      baseVersion: page.version,
      frontmatter: { status: "done" },
      markdownBody: "# Updated",
      reason: "editor-autosave"
    });

    expect(result.status).toBe("saved");
    await expect(fs.readFile(path.join(root, "Idea.md"), "utf8")).resolves.toBe(
      "---\nstatus: done\n---\n# Updated"
    );
  });

  it("publishes page.changed after a successful save", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Idea.md"), "# Idea", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const events: RumiEventEnvelope[] = [];
    const unsubscribe = runtime.events.subscribe((event) => {
      events.push(event);
    });
    const page = await runtime.openPage("Idea.md");
    const result = await runtime.savePage({
      path: page.path,
      baseVersion: page.version,
      frontmatter: page.frontmatter,
      markdownBody: "# Updated",
      reason: "manual-save"
    });

    unsubscribe();

    expect(result.status).toBe("saved");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 1,
      event: {
        name: "page.changed",
        path: "Idea.md",
        changedBy: "manual-save",
        affects: ["frontmatter", "body"]
      }
    });
  });

  it("rejects stale saves without overwriting newer content", async () => {
    const root = await tempWorkspace();
    const filePath = path.join(root, "Idea.md");
    await fs.writeFile(filePath, "# One", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const page = await runtime.openPage("Idea.md");
    await fs.writeFile(filePath, "# External change", "utf8");

    const events: RumiEventEnvelope[] = [];
    const unsubscribe = runtime.events.subscribe((event) => {
      events.push(event);
    });
    const result = await runtime.savePage({
      path: "Idea.md",
      baseVersion: page.version,
      frontmatter: {},
      markdownBody: "# Local stale change",
      reason: "editor-autosave"
    });
    unsubscribe();

    expect(result.status).toBe("conflict");
    expect(events).toEqual([]);
    await expect(fs.readFile(filePath, "utf8")).resolves.toBe("# External change");
  });

  it("creates pages and folder pages", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    await runtime.createPage({
      parentPath: "",
      name: "Roadmap",
      frontmatter: { status: "ready" },
      markdownBody: "# Roadmap"
    });
    await runtime.createFolder({
      parentPath: "",
      name: "Projects"
    });

    await expect(fs.readFile(path.join(root, "Roadmap.md"), "utf8")).resolves.toBe(
      "---\nstatus: ready\n---\n# Roadmap"
    );
    await expect(fs.readFile(path.join(root, "Projects", "Projects.index.md"), "utf8")).resolves.toBe(
      "# Projects\n"
    );
  });

  it("uses portable sanitized names for create and rename commands", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    const created = await runtime.createPage({
      parentPath: "",
      name: "test/page",
      markdownBody: "# Test"
    });
    expect(created.path).toBe("test⧸page.md");

    const renamed = await runtime.renameNode({
      path: "test⧸page.md",
      newName: "other/name?"
    });
    expect(renamed.path).toBe("other⧸name.md");
    await expect(fs.readFile(path.join(root, "other⧸name.md"), "utf8")).resolves.toBe("# Test");
  });

  it("renames pages and folder companion files", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Old.md"), "# Old", "utf8");
    await fs.mkdir(path.join(root, "Projects"), { recursive: true });
    await fs.writeFile(path.join(root, "Projects", "Projects.index.md"), "# Projects", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.renameNode({ path: "Old.md", newName: "New" });
    await runtime.renameNode({ path: "Projects", newName: "Archive" });

    await expect(fs.readFile(path.join(root, "New.md"), "utf8")).resolves.toBe("# Old");
    await expect(fs.stat(path.join(root, "Old.md"))).rejects.toThrow();
    await expect(fs.readFile(path.join(root, "Archive", "Archive.index.md"), "utf8")).resolves.toBe(
      "# Projects"
    );
    await expect(fs.stat(path.join(root, "Archive", "Projects.index.md"))).rejects.toThrow();
  });

  it("moves and deletes nodes", async () => {
    const root = await tempWorkspace();
    await fs.mkdir(path.join(root, "Inbox"), { recursive: true });
    await fs.mkdir(path.join(root, "Archive"), { recursive: true });
    await fs.writeFile(path.join(root, "Inbox", "Note.md"), "# Note", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.moveNode({ path: "Inbox/Note.md", newParentPath: "Archive" });

    await expect(fs.readFile(path.join(root, "Archive", "Note.md"), "utf8")).resolves.toBe("# Note");
    await expect(fs.stat(path.join(root, "Inbox", "Note.md"))).rejects.toThrow();

    await runtime.deleteNode({ path: "Archive/Note.md" });
    await expect(fs.stat(path.join(root, "Archive", "Note.md"))).rejects.toThrow();
  });

  it("reconciles external page edits as page.changed events", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Idea.md"), "# Idea", "utf8");
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.reconcileWorkspace();
    const events: RumiEventEnvelope[] = [];
    const unsubscribe = runtime.events.subscribe((event) => {
      events.push(event);
    });

    await fs.writeFile(path.join(root, "Idea.md"), "# Updated externally", "utf8");
    const result = await runtime.reconcileWorkspace();
    unsubscribe();

    expect(result.events).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: {
        name: "page.changed",
        path: "Idea.md",
        changedBy: "filesystem",
        affects: ["body", "frontmatter"]
      }
    });
  });

  it("reconciles external page add and delete operations", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.reconcileWorkspace();

    await fs.writeFile(path.join(root, "New.md"), "# New", "utf8");
    const added = await runtime.reconcileWorkspace();
    expect(added.events).toMatchObject([
      {
        name: "page.changed",
        path: "New.md",
        changedBy: "filesystem",
        affects: ["tree", "body", "frontmatter"]
      },
      {
        name: "workspace.treeChanged",
        affects: ["tree"]
      }
    ]);

    await fs.rm(path.join(root, "New.md"));
    const removed = await runtime.reconcileWorkspace();
    expect(removed.events).toMatchObject([
      {
        name: "page.deleted",
        path: "New.md",
        affects: ["tree"]
      },
      {
        name: "workspace.treeChanged",
        affects: ["tree"]
      }
    ]);
  });

  it("reconciles atomic write style replacement as a page edit", async () => {
    const root = await tempWorkspace();
    const filePath = path.join(root, "Idea.md");
    await fs.writeFile(filePath, "# Idea", "utf8");
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.reconcileWorkspace();

    const replacementPath = path.join(root, ".Idea.md.tmp");
    await fs.writeFile(replacementPath, "# Atomic update", "utf8");
    await fs.rename(replacementPath, filePath);
    const result = await runtime.reconcileWorkspace();

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      name: "page.changed",
      path: "Idea.md",
      changedBy: "filesystem"
    });
  });

  it("reconciles likely external file moves by fingerprint", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Old.md"), "# Same content", "utf8");
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.reconcileWorkspace();

    await fs.rename(path.join(root, "Old.md"), path.join(root, "New.md"));
    const result = await runtime.reconcileWorkspace();

    expect(result.events).toMatchObject([
      {
        name: "page.moved",
        previousPath: "Old.md",
        path: "New.md",
        affects: ["tree"]
      },
      {
        name: "workspace.treeChanged",
        affects: ["tree"]
      }
    ]);
  });
});

async function tempWorkspace(): Promise<string> {
  const root = await createTempWorkspace();
  cleanupPaths.push(root);
  return root;
}

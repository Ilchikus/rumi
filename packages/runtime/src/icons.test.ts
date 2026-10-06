import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RumiEventEnvelope, WorkspaceNode } from "@rumi/contracts";
import { createTempWorkspace, WorkspaceRuntime } from "./index";
import { rewriteMarkdownReferences } from "./reference-repair";

const cleanupPaths: string[] = [];

afterEach(async () => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    await fs.rm(cleanupPath, { recursive: true, force: true });
  }
});

async function workspace(files: Record<string, string>): Promise<{ root: string; runtime: WorkspaceRuntime }> {
  const root = await createTempWorkspace("rumi-icons-");
  cleanupPaths.push(root);
  for (const [relPath, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
    await fs.writeFile(path.join(root, relPath), content, "utf8");
  }
  return { root, runtime: await WorkspaceRuntime.open({ rootPath: root }) };
}

function findNode(node: WorkspaceNode, nodePath: string): WorkspaceNode | undefined {
  if (node.path === nodePath) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, nodePath);
    if (found) return found;
  }
  return undefined;
}

describe("workspace item icons", () => {
  it("exposes frontmatter icons of pages, companions, and the workspace on tree nodes", async () => {
    const { runtime } = await workspace({
      "index.md": "---\nicon: 🏠\n---\nHome",
      "Idea.md": "---\nicon: ph:lightbulb\ntags: [a]\n---\n# Idea",
      "Plain.md": "No icon",
      "Projects/Projects.index.md": "---\nicon: .assets/projects.png\n---\n",
      "Tasks/Tasks.db.md": "---\ntype: database\nicon: \"✅\"\nproperties: {}\n---\n",
      "Tasks/First.md": "---\nicon: \"  \"\n---\n"
    });

    // A never-indexed workspace serves its tree at once, then announces icons.
    const events: RumiEventEnvelope[] = [];
    runtime.events.subscribe((event) => events.push(event));
    await runtime.getTree();
    await runtime.flushBackgroundTasks();
    expect(events.map((envelope) => envelope.event.name)).toContain("workspace.treeChanged");
    const tree = await runtime.getTree();

    expect(tree.icon).toBe("🏠");
    expect(findNode(tree, "Idea.md")?.icon).toBe("ph:lightbulb");
    expect(findNode(tree, "Plain.md")).not.toHaveProperty("icon");
    expect(findNode(tree, "Projects")?.icon).toBe(".assets/projects.png");
    expect(findNode(tree, "Tasks")?.icon).toBe("✅");
    expect(findNode(tree, "Tasks/First.md")).not.toHaveProperty("icon");
  });

  it("sets and removes icons without touching content or other frontmatter", async () => {
    const { root, runtime } = await workspace({
      "Idea.md": "---\ntags:\n  - a\n---\n# Idea\n\nBody\n",
      "Tasks/Tasks.db.md": "---\ntype: database\nproperties:\n  status:\n    type: text\n---\n"
    });

    await runtime.setWorkspaceItemIcon({ path: "Idea.md", icon: " 🚀 " });
    await expect(fs.readFile(path.join(root, "Idea.md"), "utf8"))
      .resolves.toBe("---\ntags:\n  - a\nicon: 🚀\n---\n# Idea\n\nBody\n");

    await runtime.setWorkspaceItemIcon({ path: "Tasks", icon: "ph:check-square" });
    const query = await runtime.queryDatabase({ databasePath: "Tasks" });
    expect(Object.keys(query.schema.properties)).toEqual(["status"]);
    await runtime.createDatabaseProperty({
      databasePath: "Tasks",
      baseVersion: query.schemaVersion,
      property: "owner",
      type: "text"
    });
    expect(findNode(await runtime.getTree(), "Tasks")?.icon).toBe("ph:check-square");

    await runtime.setWorkspaceItemIcon({ path: "Idea.md", icon: null });
    await expect(fs.readFile(path.join(root, "Idea.md"), "utf8"))
      .resolves.toBe("---\ntags:\n  - a\n---\n# Idea\n\nBody\n");
  });

  it("creates a missing folder companion and uses the existing workspace home page", async () => {
    const { root, runtime } = await workspace({ "Loose/Note.md": "Note" });

    await runtime.setWorkspaceItemIcon({ path: "Loose", icon: "📁" });
    await runtime.setWorkspaceItemIcon({ path: "", icon: "🌲" });

    await expect(fs.readFile(path.join(root, "Loose", "Loose.index.md"), "utf8"))
      .resolves.toBe("---\nicon: 📁\n---\n");
    await expect(fs.readFile(path.join(root, "index.md"), "utf8"))
      .resolves.toBe("---\nicon: 🌲\n---\n");
    const tree = await runtime.getTree();
    expect(tree.icon).toBe("🌲");
    expect(findNode(tree, "Loose")).toMatchObject({
      companionPath: "Loose/Loose.index.md",
      icon: "📁"
    });
  });

  it("announces a tree change only when an icon actually changes, including external edits", async () => {
    const { root, runtime } = await workspace({ "Idea.md": "---\nstatus: draft\n---\nIdea" });
    await runtime.getTree();
    await runtime.flushBackgroundTasks();
    // The server watches from startup; reconcile once to take the same baseline.
    await runtime.reconcileWorkspace();
    const events: RumiEventEnvelope[] = [];
    runtime.events.subscribe((event) => events.push(event));
    const treeChanges = () => events
      .map((envelope) => envelope.event)
      .filter((event) => event.name === "workspace.treeChanged");

    const page = await runtime.openPage("Idea.md");
    await runtime.savePage({
      path: "Idea.md",
      baseVersion: page.version,
      frontmatter: { status: "done" },
      markdownBody: page.markdownBody,
      reason: "api"
    });
    expect(treeChanges()).toHaveLength(0);

    await runtime.setWorkspaceItemIcon({ path: "Idea.md", icon: "⭐" });
    expect(treeChanges()).toHaveLength(1);
    expect(treeChanges()[0]).toMatchObject({ path: "Idea.md", affects: ["tree"] });

    await fs.writeFile(path.join(root, "Idea.md"), "---\nicon: 🌙\n---\nIdea", "utf8");
    await runtime.reconcileWorkspace();
    expect(treeChanges()).toHaveLength(2);
    expect(findNode(await runtime.getTree(), "Idea.md")?.icon).toBe("🌙");
  });

  it("keeps the icon key out of database schemas", async () => {
    const { runtime } = await workspace({
      "Tasks/Tasks.db.md": "---\ntype: database\nproperties:\n  status:\n    type: text\n---\n"
    });
    const query = await runtime.queryDatabase({ databasePath: "Tasks" });

    await expect(runtime.createDatabaseProperty({
      databasePath: "Tasks",
      baseVersion: query.schemaVersion,
      property: "icon",
      type: "text"
    })).rejects.toThrow("reserved for the item icon");
    await expect(runtime.renameDatabaseProperty({
      databasePath: "Tasks",
      baseVersion: query.schemaVersion,
      property: "status",
      newName: "icon"
    })).rejects.toThrow("reserved for the item icon");
  });

  it("follows an uploaded icon when its asset is renamed", async () => {
    const { root, runtime } = await workspace({});
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const saved = await runtime.saveAsset("logo.png", png);
    await fs.writeFile(path.join(root, "Idea.md"), `---\nicon: ${saved.path}\n---\nIdea`, "utf8");

    await runtime.renameNode({ path: saved.path, newName: "brand.png" });
    await runtime.flushBackgroundTasks();

    await expect(fs.readFile(path.join(root, "Idea.md"), "utf8"))
      .resolves.toBe("---\nicon: .assets/brand.png\n---\nIdea");
  });
});

describe("icon reference repair", () => {
  it("rewrites only a matching top-level frontmatter icon path", () => {
    const source = [
      "---",
      "icon: \".assets/old.png\"",
      "cover: .assets/old.png",
      "---",
      "icon: .assets/old.png"
    ].join("\n");

    const result = rewriteMarkdownReferences(source, ".assets/old.png", ".assets/new.png");

    expect(result.referenceCount).toBe(1);
    expect(result.markdown).toBe([
      "---",
      "icon: \".assets/new.png\"",
      "cover: .assets/old.png",
      "---",
      "icon: .assets/old.png"
    ].join("\n"));
    expect(rewriteMarkdownReferences("---\nicon: ph:folder\n---\n", "ph:folder", "x").referenceCount)
      .toBe(0);
  });
});

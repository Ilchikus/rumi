import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RumiEventEnvelope } from "@rumi/contracts";
import { DATABASE_PROPERTY_OPTION_COLORS } from "@rumi/contracts";
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
    expect(runtime.assetPolicy).toMatchObject({ maxFileSizeMb: 50 });
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
    const rootIndexName = `${path.basename(root)}.index.md`;
    await fs.mkdir(path.join(root, "Projects"), { recursive: true });
    await fs.mkdir(path.join(root, ".rumi"), { recursive: true });
    await fs.writeFile(path.join(root, rootIndexName), "# Home", "utf8");
    await fs.writeFile(path.join(root, "Projects", "Projects.index.md"), "# Projects", "utf8");
    await fs.writeFile(path.join(root, "Projects", "Idea.md"), "# Idea", "utf8");
    await fs.writeFile(path.join(root, ".rumi", "index.json"), "", "utf8");
    await fs.writeFile(path.join(root, "package.json"), "{}", "utf8");
    await fs.writeFile(path.join(root, "package-lock.json"), "{}", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const tree = await runtime.getTree();

    expect(tree.kind).toBe("workspace");
    expect(tree.companionPath).toBe(rootIndexName);
    expect(tree.children?.map((child) => child.name)).toEqual(["Projects"]);
    expect(tree.children?.[0]).toMatchObject({
      name: "Projects",
      kind: "folder",
      companionPath: "Projects/Projects.index.md"
    });
    expect(tree.children?.[0]?.children?.map((child) => child.name)).toEqual(["Idea.md"]);
  });

  it("owns collision-safe asset storage and restricted asset reads", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const events: RumiEventEnvelope[] = [];
    runtime.events.subscribe((event) => events.push(event));
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const first = await runtime.saveAsset("diagram.png", bytes);
    const second = await runtime.saveAsset("diagram.png", bytes);
    const asset = await runtime.readAsset(first.path);

    expect(first.path).toBe(".assets/diagram.png");
    expect(second.path).toBe(".assets/diagram (1).png");
    expect(asset).toMatchObject({ fileName: "diagram.png", contentType: "image/png" });
    expect(asset.data).toEqual(bytes);
    expect(events.map((entry) => entry.event.name)).toEqual(["asset.changed", "asset.changed"]);
    await expect(runtime.readAsset("Idea.md")).rejects.toThrow(/not a readable workspace asset/);
    await expect(runtime.saveAsset("script.svg", Buffer.from("<svg/>"))).rejects.toThrow(/Unsupported asset type/);
  });

  it("enforces workspace-specific upload types, size limits, and file signatures", async () => {
    const root = await tempWorkspace();
    await fs.mkdir(path.join(root, ".rumi"), { recursive: true });
    await fs.mkdir(path.join(root, ".assets"), { recursive: true });
    await fs.writeFile(path.join(root, ".assets", "existing.pdf"), "%PDF-1.7", "utf8");
    await fs.writeFile(
      path.join(root, ".rumi", "config.json"),
      JSON.stringify({
        uploads: {
          maxFileSizeMb: 1,
          allowedFileTypes: ["png", ".jpg"]
        }
      }),
      "utf8"
    );
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    expect(runtime.assetPolicy).toEqual({
      maxFileSizeBytes: 1024 * 1024,
      maxFileSizeMb: 1,
      allowedFileTypes: [".png", ".jpg"]
    });
    await expect(runtime.readAsset(".assets/existing.pdf")).resolves.toMatchObject({
      contentType: "application/pdf"
    });
    await expect(runtime.saveAsset("document.pdf", Buffer.from("%PDF-1.7"))).rejects.toThrow(
      /not allowed by this workspace/
    );
    await expect(runtime.saveAsset("pretend.png", Buffer.from("not a png"))).rejects.toThrow(
      /does not match/
    );
    await expect(runtime.saveAsset("large.png", Buffer.alloc(1024 * 1024 + 1))).rejects.toThrow(
      /1 MB upload limit/
    );
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

  it("opens the workspace root through its index companion", async () => {
    const root = await tempWorkspace();
    const rootIndexName = `${path.basename(root)}.index.md`;
    await fs.writeFile(path.join(root, rootIndexName), "# Home", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    await expect(runtime.openPage("")).resolves.toMatchObject({
      path: rootIndexName,
      kind: "folder",
      markdownBody: "# Home"
    });
    await expect(runtime.openPage(rootIndexName)).resolves.toMatchObject({
      path: rootIndexName,
      kind: "folder",
      markdownBody: "# Home"
    });
  });

  it("uses a plain root index.md as the editable workspace home", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "index.md"), "Root folder contents", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const tree = await runtime.getTree();

    expect(tree.companionPath).toBe("index.md");
    expect(tree.children?.some((child) => child.path === "index.md")).toBe(false);
    await expect(runtime.openPage("")).resolves.toMatchObject({
      path: "index.md",
      kind: "folder",
      markdownBody: "Root folder contents"
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
    await runtime.createPage({
      parentPath: "",
      name: "Empty note"
    });
    await runtime.createFolder({
      parentPath: "",
      name: "Projects"
    });

    await expect(fs.readFile(path.join(root, "Roadmap.md"), "utf8")).resolves.toBe(
      "---\nstatus: ready\n---\n# Roadmap"
    );
    await expect(fs.readFile(path.join(root, "Empty note.md"), "utf8")).resolves.toBe("");
    await expect(fs.readFile(path.join(root, "Projects", "Projects.index.md"), "utf8")).resolves.toBe(
      ""
    );
  });

  it("adds parenthesized numbers when create, rename, and move destinations already exist", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    const firstPage = await runtime.createPage({ parentPath: "", name: "Note", markdownBody: "First" });
    const secondPage = await runtime.createPage({ parentPath: "", name: "Note", markdownBody: "Second" });
    const thirdPage = await runtime.createPage({ parentPath: "", name: "Note", markdownBody: "Third" });
    expect([firstPage.path, secondPage.path, thirdPage.path]).toEqual([
      "Note.md",
      "Note (1).md",
      "Note (2).md"
    ]);
    await expect(fs.readFile(path.join(root, "Note.md"), "utf8")).resolves.toBe("First");
    await expect(fs.readFile(path.join(root, "Note (1).md"), "utf8")).resolves.toBe("Second");

    const firstFolder = await runtime.createFolder({ parentPath: "", name: "Projects" });
    const secondFolder = await runtime.createFolder({ parentPath: "", name: "Projects" });
    expect([firstFolder.path, secondFolder.path]).toEqual(["Projects", "Projects (1)"]);
    await expect(
      fs.stat(path.join(root, "Projects (1)", "Projects (1).index.md"))
    ).resolves.toBeDefined();

    const firstDatabase = await runtime.createDatabase({ parentPath: "", name: "Tasks" });
    const secondDatabase = await runtime.createDatabase({ parentPath: "", name: "Tasks" });
    expect([firstDatabase.path, secondDatabase.path]).toEqual(["Tasks", "Tasks (1)"]);
    await expect(
      fs.stat(path.join(root, "Tasks (1)", "Tasks (1).db.md"))
    ).resolves.toBeDefined();

    const firstRecord = await runtime.createDatabaseRecord({ databasePath: "Tasks", name: "Todo" });
    const secondRecord = await runtime.createDatabaseRecord({ databasePath: "Tasks", name: "Todo" });
    expect([firstRecord.path, secondRecord.path]).toEqual([
      "Tasks/Todo.md",
      "Tasks/Todo (1).md"
    ]);

    await runtime.createPage({ parentPath: "", name: "Other", markdownBody: "Other" });
    const renamed = await runtime.renameNode({ path: "Other.md", newName: "Note" });
    expect(renamed.path).toBe("Note (3).md");
    await expect(fs.readFile(path.join(root, renamed.path), "utf8")).resolves.toBe("Other");

    await runtime.createPage({ parentPath: "Projects", name: "Shared", markdownBody: "Source" });
    await runtime.createPage({ parentPath: "Projects (1)", name: "Shared", markdownBody: "Existing" });
    const moved = await runtime.moveNode({
      path: "Projects/Shared.md",
      newParentPath: "Projects (1)"
    });
    expect(moved.path).toBe("Projects (1)/Shared (1).md");
    await expect(fs.readFile(path.join(root, moved.path), "utf8")).resolves.toBe("Source");
  });

  it("converts folders to databases with a merged schema and back to folders", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createFolder({ parentPath: "", name: "Projects", markdownBody: "Project notes" });
    const folderPage = await runtime.openPage("Projects");
    await runtime.savePage({
      path: folderPage.path,
      baseVersion: folderPage.version,
      frontmatter: { summary: "Active work" },
      markdownBody: folderPage.markdownBody,
      reason: "api"
    });
    await runtime.createPage({
      parentPath: "Projects",
      name: "Alpha",
      frontmatter: {
        status: "todo",
        effort: 3,
        done: true,
        due: "2026-07-21",
        tags: ["one", "two"],
        mixed: 7
      },
      markdownBody: "Alpha body"
    });
    await runtime.createPage({
      parentPath: "Projects",
      name: "Beta",
      frontmatter: {
        status: "ready",
        due: "2026-07-22",
        tags: ["two"],
        mixed: "seven"
      },
      markdownBody: "Beta body"
    });
    await runtime.createFolder({ parentPath: "Projects", name: "Nested" });
    await runtime.createPage({
      parentPath: "Projects/Nested",
      name: "Child",
      frontmatter: { nestedOnly: true }
    });

    const converted = await runtime.convertContainer({ path: "Projects", targetKind: "database" });
    expect(converted.events.map((event) => event.name)).toEqual(
      expect.arrayContaining([
        "page.moved",
        "database.schemaChanged",
        "database.recordsChanged",
        "workspace.treeChanged"
      ])
    );
    await expect(fs.stat(path.join(root, "Projects", "Projects.index.md"))).rejects.toThrow();
    await expect(fs.stat(path.join(root, "Projects", "Projects.db.md"))).resolves.toBeDefined();

    const tree = await runtime.getTree();
    expect(tree.children?.find((node) => node.path === "Projects")).toMatchObject({
      kind: "database",
      companionPath: "Projects/Projects.db.md"
    });
    const databasePage = await runtime.openPage("Projects");
    expect(databasePage).toMatchObject({
      kind: "database",
      frontmatter: { summary: "Active work", type: "database" },
      markdownBody: "Project notes"
    });

    const query = await runtime.queryDatabase({ databasePath: "Projects" });
    expect(query.schema.properties).toEqual({
      done: { type: "checkbox" },
      due: { type: "date" },
      effort: { type: "number" },
      mixed: { type: "text" },
      status: { type: "text" },
      tags: { type: "multi-select", options: [{ name: "one" }, { name: "two" }] }
    });
    expect(query.schema.views[0]?.columns).toEqual([
      "done",
      "due",
      "effort",
      "mixed",
      "status",
      "tags"
    ]);
    expect(query.records.find((record) => record.title === "Alpha")?.frontmatter).toEqual({
      done: true,
      due: "2026-07-21",
      effort: 3,
      mixed: "7",
      status: "todo",
      tags: ["one", "two"]
    });
    expect(query.records.find((record) => record.title === "Beta")?.frontmatter).toEqual({
      done: false,
      due: "2026-07-22",
      effort: null,
      mixed: "seven",
      status: "ready",
      tags: ["two"]
    });
    expect((await runtime.openPage("Projects/Nested/Child.md")).frontmatter).toEqual({
      nestedOnly: true
    });

    await runtime.convertContainer({ path: "Projects", targetKind: "folder" });
    await expect(fs.stat(path.join(root, "Projects", "Projects.db.md"))).rejects.toThrow();
    const restoredFolderPage = await runtime.openPage("Projects");
    expect(restoredFolderPage).toMatchObject({
      kind: "folder",
      frontmatter: { summary: "Active work" },
      markdownBody: "Project notes"
    });
    expect(restoredFolderPage.frontmatter).not.toHaveProperty("type");
    expect(restoredFolderPage.frontmatter).not.toHaveProperty("properties");
    expect(restoredFolderPage.frontmatter).not.toHaveProperty("views");
  });

  it("rejects invalid container conversions without replacing existing companions", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createFolder({ parentPath: "", name: "Projects" });

    await expect(runtime.convertContainer({ path: "", targetKind: "database" })).rejects.toThrow(
      /workspace root/
    );
    await expect(runtime.convertContainer({ path: "Projects", targetKind: "folder" })).rejects.toThrow(
      /Database companion does not exist/
    );
    await fs.writeFile(path.join(root, "Projects", "Projects.db.md"), "collision", "utf8");
    await expect(runtime.convertContainer({ path: "Projects", targetKind: "database" })).rejects.toThrow(
      /already exists/
    );
    await expect(fs.readFile(path.join(root, "Projects", "Projects.index.md"), "utf8")).resolves.toBe("");
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

  it("renames pages, directories, and their folder or database companion files", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Old.md"), "# Old", "utf8");
    await fs.mkdir(path.join(root, "Projects"), { recursive: true });
    await fs.writeFile(path.join(root, "Projects", "Projects.index.md"), "# Projects", "utf8");
    await fs.mkdir(path.join(root, "Tasks"), { recursive: true });
    await fs.writeFile(path.join(root, "Tasks", "Tasks.db.md"), "# Tasks", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.renameNode({ path: "Old.md", newName: "New" });
    await runtime.renameNode({ path: "Projects", newName: "Archive" });
    await runtime.renameNode({ path: "Tasks", newName: "Work" });

    await expect(fs.readFile(path.join(root, "New.md"), "utf8")).resolves.toBe("# Old");
    await expect(fs.stat(path.join(root, "Old.md"))).rejects.toThrow();
    await expect(fs.readFile(path.join(root, "Archive", "Archive.index.md"), "utf8")).resolves.toBe(
      "# Projects"
    );
    await expect(fs.stat(path.join(root, "Archive", "Projects.index.md"))).rejects.toThrow();
    await expect(fs.readFile(path.join(root, "Work", "Work.db.md"), "utf8")).resolves.toBe(
      "# Tasks"
    );
    await expect(fs.stat(path.join(root, "Work", "Tasks.db.md"))).rejects.toThrow();
  });

  it("repairs links and mentions in the background after a rename", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Old.md"), "# Old", "utf8");
    await fs.writeFile(
      path.join(root, "References.md"),
      [
        "---",
        'related: "[[Old]]"',
        "---",
        "[Old](Old.md)",
        "[Custom label](Old.md#details)",
        "`[Old](Old.md)`"
      ].join("\n"),
      "utf8"
    );

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.rebuildIndex();
    const events: RumiEventEnvelope[] = [];
    runtime.events.subscribe((event) => events.push(event));

    const renamed = await runtime.renameNode({ path: "Old.md", newName: "New" });
    expect(renamed.path).toBe("New.md");
    await expect(fs.stat(path.join(root, "New.md"))).resolves.toBeDefined();

    await runtime.flushBackgroundTasks();

    await expect(fs.readFile(path.join(root, "References.md"), "utf8")).resolves.toBe(
      [
        "---",
        'related: "[[New]]"',
        "---",
        "[New](New.md)",
        "[Custom label](New.md#details)",
        "`[Old](Old.md)`"
      ].join("\n")
    );
    expect(events.some(({ event }) =>
      event.name === "page.changed" &&
      event.path === "References.md" &&
      event.changedBy === "reference-repair"
    )).toBe(true);
    const search = await runtime.searchWorkspace({ query: "New.md" });
    expect(search.items.some((result) => result.path === "References.md")).toBe(true);
  });

  it("repairs references to the actual parenthesized path selected for a duplicate rename", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Old.md"), "# Old", "utf8");
    await fs.writeFile(path.join(root, "New.md"), "# Existing", "utf8");
    await fs.writeFile(path.join(root, "References.md"), "[Old](Old.md) and [[Old]]", "utf8");

    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const renamed = await runtime.renameNode({ path: "Old.md", newName: "New" });
    expect(renamed.path).toBe("New (1).md");

    await runtime.flushBackgroundTasks();
    await expect(fs.readFile(path.join(root, "References.md"), "utf8")).resolves.toBe(
      "[New (1)](New%20(1).md) and [[New (1)]]"
    );
    await expect(fs.readFile(path.join(root, "New.md"), "utf8")).resolves.toBe("# Existing");
    await expect(fs.readFile(path.join(root, "New (1).md"), "utf8")).resolves.toBe("# Old");
  });

  it("repairs references in a document that moves during the background scan", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Old.md"), "# Old", "utf8");
    await fs.mkdir(path.join(root, "Projects"));
    await fs.writeFile(
      path.join(root, "Projects", "Projects.index.md"),
      "[Old](Old.md)",
      "utf8"
    );
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    await runtime.renameNode({ path: "Old.md", newName: "New" });
    await runtime.renameNode({ path: "Projects", newName: "Archive" });
    await runtime.flushBackgroundTasks();

    await expect(
      fs.readFile(path.join(root, "Archive", "Archive.index.md"), "utf8")
    ).resolves.toBe("[New](New.md)");
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

  it("moves every workspace item type to portable Trash and restores without overwriting", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createPage({ parentPath: "", name: "Note", markdownBody: "# Original" });
    await runtime.createFolder({ parentPath: "", name: "Projects", markdownBody: "# Projects" });
    await runtime.createDatabase({ parentPath: "", name: "Tasks" });
    const asset = await runtime.saveAsset(
      "diagram.png",
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

    await runtime.deleteNode({ path: "Note.md" });
    await runtime.deleteNode({ path: "Projects", recursive: true });
    await runtime.deleteNode({ path: "Tasks", recursive: true });
    await runtime.deleteNode({ path: asset.path });

    const trash = await runtime.listTrash();
    expect(trash.items.map((item) => [item.originalPath, item.kind])).toEqual(
      expect.arrayContaining([
        ["Note.md", "page"],
        ["Projects", "folder"],
        ["Tasks", "database"],
        [".assets/diagram.png", "asset"]
      ])
    );
    await expect(fs.stat(path.join(root, ".rumi", "trash"))).resolves.toBeDefined();

    await fs.writeFile(path.join(root, "Note.md"), "# Replacement", "utf8");
    const noteItem = trash.items.find((item) => item.originalPath === "Note.md");
    const databaseItem = trash.items.find((item) => item.originalPath === "Tasks");
    const folderItem = trash.items.find((item) => item.originalPath === "Projects");
    const assetItem = trash.items.find((item) => item.originalPath === ".assets/diagram.png");
    expect(noteItem && databaseItem && folderItem && assetItem).toBeTruthy();

    const restoredNote = await runtime.restoreTrashItem({ id: noteItem!.id });
    expect(restoredNote).toMatchObject({
      originalPath: "Note.md",
      path: "Note (1).md",
      restoredToOriginalPath: false
    });
    await expect(fs.readFile(path.join(root, "Note.md"), "utf8")).resolves.toBe("# Replacement");
    await expect(fs.readFile(path.join(root, restoredNote.path), "utf8")).resolves.toContain("# Original");

    await fs.mkdir(path.join(root, "Tasks"));
    const restoredDatabase = await runtime.restoreTrashItem({ id: databaseItem!.id });
    expect(restoredDatabase.path).toBe("Tasks (1)");
    await expect(
      fs.stat(path.join(root, "Tasks (1)", "Tasks (1).db.md"))
    ).resolves.toBeDefined();

    await runtime.restoreTrashItem({ id: folderItem!.id });
    await runtime.restoreTrashItem({ id: assetItem!.id });
    await expect(fs.stat(path.join(root, "Projects", "Projects.index.md"))).resolves.toBeDefined();
    await expect(fs.readFile(path.join(root, ".assets", "diagram.png"))).resolves.toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    expect((await runtime.listTrash()).items).toEqual([]);
  });

  it("rejects attempts to trash the workspace root or Rumi internals", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    await expect(runtime.deleteNode({ path: "", recursive: true })).rejects.toThrow(/workspace root/);
    await expect(runtime.deleteNode({ path: ".rumi", recursive: true })).rejects.toThrow(/\.rumi internals/);
    await expect(fs.stat(root)).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, ".rumi", "index.json"))).resolves.toBeDefined();
  });

  it("creates a folder-backed database and records through runtime commands", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    const database = await runtime.createDatabase({ parentPath: "", name: "Tasks" });
    const record = await runtime.createDatabaseRecord({
      databasePath: database.path,
      name: "Ship editor",
      frontmatter: { status: "doing", priority: 2 }
    });
    const query = await runtime.queryDatabase({ databasePath: database.path });

    expect(database.path).toBe("Tasks");
    expect(record.path).toBe("Tasks/Ship editor.md");
    expect(query).toMatchObject({
      databasePath: "Tasks",
      configPath: "Tasks/Tasks.db.md",
      schema: {
        type: "database",
        properties: {},
        unsupportedProperties: [],
        views: [{ name: "All", type: "table", columns: [] }]
      },
      records: [
        {
          path: "Tasks/Ship editor.md",
          title: "Ship editor",
          frontmatter: { status: "doing", priority: 2 }
        }
      ]
    });

    await expect(runtime.openPage(record.path)).resolves.toMatchObject({
      path: "Tasks/Ship editor.md",
      database: {
        databasePath: "Tasks",
        schemaVersion: query.schemaVersion,
        schema: query.schema
      }
    });
  });

  it("updates database schema and record properties without client-side file coordination", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createDatabase({ parentPath: "", name: "Tasks" });
    const created = await runtime.createDatabaseRecord({ databasePath: "Tasks", name: "One" });
    const initial = await runtime.queryDatabase({ databasePath: "Tasks" });

    const schemaResult = await runtime.updateDatabaseSchema({
      databasePath: "Tasks",
      baseVersion: initial.schemaVersion,
      properties: {
        status: {
          type: "select",
          options: [{ name: "todo" }, { name: "done" }]
        }
      },
      views: [{ name: "All", type: "table", columns: ["status"] }]
    });
    expect(schemaResult.status).toBe("saved");

    const recordResult = await runtime.updateDatabaseRecordProperty({
      databasePath: "Tasks",
      recordPath: created.path,
      property: "status",
      value: "done"
    });
    expect(recordResult.status).toBe("saved");

    const query = await runtime.queryDatabase({ databasePath: "Tasks" });
    expect(query.schema.properties.status).toEqual({
      type: "select",
      options: [{ name: "todo" }, { name: "done" }]
    });
    expect(query.records[0]?.frontmatter.status).toBe("done");

    const optionResult = await runtime.createDatabasePropertyOption({
      databasePath: "Tasks",
      baseVersion: query.schemaVersion,
      property: "status",
      option: "blocked",
      color: "rose"
    });
    expect(optionResult.status).toBe("saved");

    const withCreatedOption = await runtime.queryDatabase({ databasePath: "Tasks" });
    expect(withCreatedOption.schema.properties.status).toEqual({
      type: "select",
      options: [{ name: "todo" }, { name: "done" }, { name: "blocked", color: "rose" }]
    });

    await runtime.createDatabasePropertyOption({
      databasePath: "Tasks",
      baseVersion: withCreatedOption.schemaVersion,
      property: "status",
      option: "review"
    });
    const withRandomOption = await runtime.queryDatabase({ databasePath: "Tasks" });
    const randomColor = withRandomOption.schema.properties.status?.options?.find(
      (option) => option.name === "review"
    )?.color;
    expect(DATABASE_PROPERTY_OPTION_COLORS).toContain(randomColor);
  });

  it("renames a supported database property across schema, views, and records", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createDatabase({ parentPath: "", name: "Tasks" });
    await runtime.createDatabaseRecord({
      databasePath: "Tasks",
      name: "One",
      frontmatter: { status: "doing" }
    });
    const initial = await runtime.queryDatabase({ databasePath: "Tasks" });
    await runtime.updateDatabaseSchema({
      databasePath: "Tasks",
      baseVersion: initial.schemaVersion,
      properties: { status: { type: "text" } },
      views: [
        {
          name: "Doing",
          type: "table",
          columns: ["status"],
          filters: [{ property: "status", operator: "equals", value: "doing" }],
          sorts: [{ property: "status", direction: "asc" }]
        }
      ]
    });
    const beforeRename = await runtime.queryDatabase({ databasePath: "Tasks" });

    await runtime.renameDatabaseProperty({
      databasePath: "Tasks",
      baseVersion: beforeRename.schemaVersion,
      property: "status",
      newName: "state"
    });

    const renamed = await runtime.queryDatabase({ databasePath: "Tasks" });
    expect(renamed.schema.properties).toEqual({ state: { type: "text" } });
    expect(renamed.schema.views[0]).toMatchObject({
      columns: ["state"],
      filters: [{ property: "state" }],
      sorts: [{ property: "state" }]
    });
    expect(renamed.records[0]?.frontmatter).toEqual({ state: "doing" });
  });

  it("renames and deletes select options and changes or deletes schema properties across records", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createDatabase({ parentPath: "", name: "Inventory" });
    await runtime.createDatabaseRecord({
      databasePath: "Inventory",
      name: "Mini PC",
      frontmatter: { tags: ["quiet", "available"], watts: "42" }
    });
    const initial = await runtime.queryDatabase({ databasePath: "Inventory" });
    await runtime.updateDatabaseSchema({
      databasePath: "Inventory",
      baseVersion: initial.schemaVersion,
      properties: {
        tags: {
          type: "multi-select",
          options: [
            { name: "quiet", color: "teal" },
            { name: "available", color: "lime" }
          ]
        },
        watts: { type: "text" }
      },
      views: [{ name: "All", type: "table", columns: ["tags", "watts"] }]
    });

    let query = await runtime.queryDatabase({ databasePath: "Inventory" });
    await runtime.updateDatabasePropertyOption({
      databasePath: "Inventory",
      baseVersion: query.schemaVersion,
      property: "tags",
      option: "quiet",
      action: "rename",
      newName: "silent"
    });
    query = await runtime.queryDatabase({ databasePath: "Inventory" });
    expect(query.schema.properties.tags?.options).toContainEqual({ name: "silent", color: "teal" });
    expect(query.records[0]?.frontmatter.tags).toEqual(["silent", "available"]);

    await runtime.updateDatabasePropertyOption({
      databasePath: "Inventory",
      baseVersion: query.schemaVersion,
      property: "tags",
      option: "silent",
      action: "change-color",
      color: "violet"
    });
    query = await runtime.queryDatabase({ databasePath: "Inventory" });
    expect(query.schema.properties.tags?.options).toContainEqual({ name: "silent", color: "violet" });

    await runtime.updateDatabasePropertyOption({
      databasePath: "Inventory",
      baseVersion: query.schemaVersion,
      property: "tags",
      option: "available",
      action: "delete"
    });
    query = await runtime.queryDatabase({ databasePath: "Inventory" });
    expect(query.schema.properties.tags?.options).toEqual([{ name: "silent", color: "violet" }]);
    expect(query.records[0]?.frontmatter.tags).toEqual(["silent"]);

    await runtime.changeDatabasePropertyType({
      databasePath: "Inventory",
      baseVersion: query.schemaVersion,
      property: "watts",
      type: "number"
    });
    query = await runtime.queryDatabase({ databasePath: "Inventory" });
    expect(query.schema.properties.watts).toEqual({ type: "number" });
    expect(query.records[0]?.frontmatter.watts).toBe(42);

    await runtime.deleteDatabaseProperty({
      databasePath: "Inventory",
      baseVersion: query.schemaVersion,
      property: "tags"
    });
    query = await runtime.queryDatabase({ databasePath: "Inventory" });
    expect(query.schema.properties.tags).toBeUndefined();
    expect(query.schema.views[0]?.columns).toEqual(["watts"]);
    expect(query.records[0]?.frontmatter.tags).toBeUndefined();
  });

  it("preserves unsupported future database properties during schema updates", async () => {
    const root = await tempWorkspace();
    await fs.mkdir(path.join(root, "Tasks"), { recursive: true });
    await fs.writeFile(
      path.join(root, "Tasks", "Tasks.db.md"),
      "---\ntype: database\nproperties:\n  related:\n    type: relation\n    target: Projects\n  status:\n    type: text\nviews: []\n---\n# Tasks\n",
      "utf8"
    );
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    const initial = await runtime.queryDatabase({ databasePath: "Tasks" });

    expect(initial.schema.unsupportedProperties).toEqual(["related"]);
    await runtime.updateDatabaseSchema({
      databasePath: "Tasks",
      baseVersion: initial.schemaVersion,
      properties: {
        related: { type: "text" },
        status: { type: "text" }
      },
      views: [{ name: "All", type: "table", columns: ["status"] }]
    });

    const config = await fs.readFile(path.join(root, "Tasks", "Tasks.db.md"), "utf8");
    expect(config).toContain("related:\n    type: relation\n    target: Projects");
  });

  it("filters and sorts database records on the server", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createDatabase({ parentPath: "", name: "Tasks" });
    await runtime.createDatabaseRecord({
      databasePath: "Tasks",
      name: "Lower",
      frontmatter: { status: "doing", priority: 1 }
    });
    await runtime.createDatabaseRecord({
      databasePath: "Tasks",
      name: "Higher",
      frontmatter: { status: "doing", priority: 3 }
    });
    await runtime.createDatabaseRecord({
      databasePath: "Tasks",
      name: "Done",
      frontmatter: { status: "done", priority: 9 }
    });

    const query = await runtime.queryDatabase({
      databasePath: "Tasks",
      filters: [{ property: "status", operator: "equals", value: "doing" }],
      sorts: [{ property: "priority", direction: "desc" }]
    });

    expect(query.records.map((record) => record.title)).toEqual(["Higher", "Lower"]);
  });

  it("stores content-addressed snapshots without Git and restores a selected revision", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createPage({ parentPath: "", name: "History", markdownBody: "# One" });
    const firstPage = await runtime.openPage("History.md");
    await runtime.savePage({
      path: firstPage.path,
      baseVersion: firstPage.version,
      frontmatter: {},
      markdownBody: "# Two",
      reason: "manual-save"
    });

    const revisions = await runtime.listRevisions("History.md");
    expect(revisions).toHaveLength(2);
    expect(revisions.map((revision) => revision.reason)).toEqual([
      "manual-checkpoint",
      "baseline"
    ]);
    expect(revisions[0]?.objectId).toBe(revisions[1]?.objectId);

    await runtime.restoreRevision({ revisionId: revisions[1]!.revisionId });
    await expect(fs.readFile(path.join(root, "History.md"), "utf8")).resolves.toBe("# One");

    const restoredRevisions = await runtime.listRevisions("History.md");
    expect(restoredRevisions[0]).toMatchObject({
      type: "revision.restored",
      reason: "restore",
      restoredFromRevisionId: revisions[1]!.revisionId
    });
    expect(restoredRevisions[1]?.reason).toBe("before-restore");

    const blobPath = path.join(
      root,
      ".rumi",
      "revisions",
      "blobs",
      "sha256",
      revisions[1]!.contentHash.slice(0, 2),
      `${revisions[1]!.contentHash}.md`
    );
    await expect(fs.readFile(blobPath, "utf8")).resolves.toBe("# One");
  });

  it("keeps revision identity through a Rumi-controlled rename", async () => {
    const root = await tempWorkspace();
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.createPage({ parentPath: "", name: "Before", markdownBody: "Body" });
    const before = await runtime.listRevisions("Before.md");

    await runtime.renameNode({ path: "Before.md", newName: "After" });
    const after = await runtime.listRevisions("After.md");

    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(after[0]?.objectId).toBe(before[0]?.objectId);
  });

  it("rebuilds a persistent search index and ranks exact title prefixes first", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "age.md"), "Exact title", "utf8");
    await fs.writeFile(path.join(root, "agents.md"), "Prefix title", "utf8");
    await fs.writeFile(path.join(root, "homepage.md"), "Contains title", "utf8");
    await fs.writeFile(path.join(root, "body.md"), "The age query only occurs in body", "utf8");
    const runtime = await WorkspaceRuntime.open({ rootPath: root });

    const rebuilt = await runtime.rebuildIndex();
    const result = await runtime.searchWorkspace({ query: "age" });

    expect(rebuilt.documentCount).toBe(4);
    expect(result.items.map((item) => item.title)).toEqual([
      "age",
      "agents",
      "homepage",
      "body"
    ]);
    expect(result.items.map((item) => item.score)).toEqual([0, 1, 3, 6]);
    await expect(fs.stat(path.join(root, ".rumi", "index.json"))).resolves.toBeDefined();

    const reopenedRuntime = await WorkspaceRuntime.open({ rootPath: root });
    const reopenedResult = await reopenedRuntime.searchWorkspace({ query: "age" });
    expect(reopenedResult).toEqual(result);
  });

  it("updates the search index before publishing reconciled external edits", async () => {
    const root = await tempWorkspace();
    const filePath = path.join(root, "External.md");
    await fs.writeFile(filePath, "Before", "utf8");
    const runtime = await WorkspaceRuntime.open({ rootPath: root });
    await runtime.rebuildIndex();
    await runtime.reconcileWorkspace();

    await fs.writeFile(filePath, "Now contains reconciled-search-token", "utf8");
    await runtime.reconcileWorkspace();
    const result = await runtime.searchWorkspace({ query: "reconciled-search-token" });

    expect(result.items.map((item) => item.path)).toEqual(["External.md"]);
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

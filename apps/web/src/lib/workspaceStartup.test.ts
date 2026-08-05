import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { PageDocument, WorkspaceNode } from "@rumi/contracts";
import {
  STARTUP_SNAPSHOT_MAX_LENGTH,
  canHydrateStartupPage,
  readStartupPageMode,
  readWorkspaceStartupSnapshot,
  snapshotMatchesWorkspace,
  writeStartupPageMode,
  writeWorkspaceStartupSnapshot,
  type BrowserStorage,
  type WorkspaceStartupSnapshot
} from "./workspaceStartup";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("workspace startup persistence", () => {
  it("round-trips a valid, versioned workspace snapshot", () => {
    const storage = memoryStorage();
    const snapshot = startupSnapshot();

    expect(writeWorkspaceStartupSnapshot(storage, snapshot)).toBe(true);
    expect(readWorkspaceStartupSnapshot(storage)).toEqual(snapshot);
  });

  it("keeps pre-settings snapshots readable", () => {
    const storage = memoryStorage();
    const { settings: _settings, ...snapshot } = startupSnapshot();

    expect(writeWorkspaceStartupSnapshot(storage, snapshot)).toBe(true);
    expect(readWorkspaceStartupSnapshot(storage)).toEqual(snapshot);
  });

  it("rejects malformed, mismatched, and oversized snapshots", () => {
    const storage = memoryStorage();
    storage.setItem("rumi-new-workspace-startup:v1", JSON.stringify({ schemaVersion: 2 }));
    expect(readWorkspaceStartupSnapshot(storage)).toBeNull();

    const snapshot = startupSnapshot();
    expect(snapshotMatchesWorkspace(snapshot, "/workspace/notes")).toBe(true);
    expect(snapshotMatchesWorkspace(snapshot, "/workspace/other")).toBe(false);

    const oversized = {
      ...snapshot,
      page: { ...snapshot.page, markdownBody: "x".repeat(STARTUP_SNAPSHOT_MAX_LENGTH) }
    };
    expect(writeWorkspaceStartupSnapshot(storage, oversized)).toBe(false);
    expect(readWorkspaceStartupSnapshot(storage)).toBeNull();

    storage.setItem(
      "rumi-new-workspace-startup:v1",
      JSON.stringify({ ...snapshot, settings: { editor: { inlineToolbar: "side" } } })
    );
    expect(readWorkspaceStartupSnapshot(storage)).toBeNull();
  });

  it("keeps the startup choice browser-local and workspace-scoped", () => {
    const storage = memoryStorage();

    expect(readStartupPageMode(storage, "/workspace/notes")).toBe("last-visited");
    writeStartupPageMode(storage, "/workspace/notes", "home");

    expect(readStartupPageMode(storage, "/workspace/notes")).toBe("home");
    expect(readStartupPageMode(storage, "/workspace/other")).toBe("last-visited");
  });

  it("hydrates the configured cached page only for a cold visit to workspace home", () => {
    expect(canHydrateStartupPage("/", "last-visited", false)).toBe(true);
    expect(canHydrateStartupPage("/", "home", true)).toBe(true);
    expect(canHydrateStartupPage("/", "home", false)).toBe(false);
    expect(
      canHydrateStartupPage("/projects/roadmap", "last-visited", false)
    ).toBe(false);
    expect(
      canHydrateStartupPage("/projects/other", "last-visited", false)
    ).toBe(false);
    expect(canHydrateStartupPage("/settings", "last-visited", false)).toBe(false);
  });

  it("hydrates behind the authenticated App boundary and revalidates server state", () => {
    expect(appSource).toContain("readWorkspaceStartupSnapshot(window.localStorage)");
    expect(appSource).toContain("startupSnapshotRef");
    expect(appSource).toContain('startupPageMode === "last-visited"');
    expect(appSource).toContain("loadPage(homeOpenPath)");
    expect(appSource).toContain("Promise.all([api.getWorkspace(), api.getTree()])");
    expect(appSource).toContain("snapshotMatchesWorkspace");
    expect(appSource).toContain('if (route?.view === "node" && !treeRevalidated)');
    expect(appSource).toContain('saveState === "idle" || saveState === "saved"');
    expect(appSource).toContain("startupSnapshot?.settings?.editor.inlineToolbar");
    expect(appSource).toContain("cachedWorkspaceSettings");
  });
});

function startupSnapshot(): WorkspaceStartupSnapshot {
  const page: PageDocument = {
    path: "Projects/Roadmap.md",
    kind: "page",
    frontmatter: { status: "doing" },
    markdownBody: "# Roadmap",
    contentHash: "content-1",
    frontmatterHash: "frontmatter-1",
    version: "version-1"
  };
  const tree: WorkspaceNode = {
    path: "",
    name: "Notes",
    kind: "workspace",
    children: [{ path: page.path, name: "Roadmap.md", kind: "page" }]
  };

  return {
    schemaVersion: 1,
    cachedAt: 1_785_888_000_000,
    workspace: { rootPath: "/workspace/notes", name: "Notes" },
    tree,
    selection: { nodePath: page.path, openPath: page.path, kind: "page" },
    page,
    settings: {
      uploads: { maxFileSizeMb: 50, allowedFileTypes: [".png"] },
      editor: {
        highlightMisspellings: false,
        inlineReplacements: true,
        emojiSuggestions: true,
        inlineToolbar: "bottom"
      }
    }
  };
}

function memoryStorage(): BrowserStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

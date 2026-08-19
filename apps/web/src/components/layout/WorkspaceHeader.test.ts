import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { WorkspaceHeader, workspaceBreadcrumbs } from "./WorkspaceHeader";

const page: WorkspaceNode = {
  path: "Projects/Launch plan.md",
  name: "Launch plan.md",
  kind: "page"
};

const tree: WorkspaceNode = {
  path: "",
  name: "notes",
  kind: "workspace",
  companionPath: "notes.index.md",
  children: [
    {
      path: "Projects",
      name: "Projects",
      kind: "folder",
      companionPath: "Projects/Projects.index.md",
      children: [page]
    }
  ]
};

describe("workspace address bar", () => {
  it("builds navigable breadcrumbs from the root folder to the current file", () => {
    const breadcrumbs = workspaceBreadcrumbs(
      "notes",
      tree,
      { nodePath: page.path, openPath: page.path, kind: "page" },
      null
    );

    expect(breadcrumbs.map(({ label, node, current }) => ({ label, path: node?.path ?? null, current }))).toEqual([
      { label: "notes", path: "", current: false },
      { label: "Projects", path: "Projects", current: false },
      { label: "Launch plan", path: "Projects/Launch plan.md", current: true }
    ]);
  });

  it("renders breadcrumbs and the Command K search affordance in one neutral address bar", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceHeader, {
        workspaceName: "notes",
        tree,
        selection: { nodePath: page.path, openPath: page.path, kind: "page" },
        systemView: null,
        hasOpenPage: true,
        onNavigate: () => undefined,
        onToggleSearch: () => undefined,
        onMoveNode: async () => true,
        onMoveToTrash: async () => true,
        onCopyUrl: () => undefined,
        onCopyRelativePath: () => undefined,
        copyUrlShortcut: "⇧⌘C",
        copyRelativePathShortcut: "⇧⌘P",
        onSeeRevisions: () => undefined
      })
    );

    expect(markup).toContain('aria-label="Current location"');
    expect(markup).toContain('data-rumi-workspace-header=""');
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("absolute inset-x-0 top-0");
    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain("pointer-events-auto");
    expect(markup).toContain('data-rumi-address-bar=""');
    expect(markup).toMatch(/<button[^>]*>notes<\/button>/u);
    expect(markup).toContain("bg-surface-subtle");
    expect(markup).toContain("Launch plan");
    expect(markup).toContain('aria-label="Toggle search (Command K)"');
    expect(markup).toContain("⌘ K");
    expect(markup).toContain('data-rumi-header-actions=""');
    expect(markup).toContain("absolute left-full");
    expect(markup).toContain('aria-label="File actions"');
    expect(markup).not.toContain(">History<");
    expect(markup).toContain("max-w-[820px]");
    expect(markup).not.toContain("max-w-[1120px]");
  });

  it("wires URL and relative-path actions into the current-page menu", () => {
    const source = readFileSync(new URL("./WorkspaceHeader.tsx", import.meta.url), "utf8");

    expect(source).toContain("Copy URL");
    expect(source).toContain("Copy relative path");
    expect(source).toContain("onCopyUrl");
    expect(source).toContain("onCopyRelativePath");
    expect(source).toContain("copyUrlShortcut");
    expect(source).toContain("copyRelativePathShortcut");
  });

  it("shows Trash as the current address without treating it as a workspace file", () => {
    expect(workspaceBreadcrumbs("notes", tree, null, "trash").map(({ label, node, current }) => ({
      label,
      path: node?.path ?? null,
      current
    }))).toEqual([
      { label: "notes", path: "", current: false },
      { label: "Trash", path: null, current: true }
    ]);
  });

  it("shows Settings as a system-page address without widening the address bar", () => {
    expect(workspaceBreadcrumbs("notes", tree, null, "settings").map((breadcrumb) => (
      breadcrumb.label
    ))).toEqual(["notes", "Settings"]);
  });
});

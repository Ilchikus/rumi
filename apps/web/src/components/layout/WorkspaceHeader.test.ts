import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { WorkspaceHeader, workspaceBreadcrumbs } from "./WorkspaceHeader";

const headerSource = readFileSync(new URL("./WorkspaceHeader.tsx", import.meta.url), "utf8");
const headerControlSource = readFileSync(
  new URL("./EditorHeaderIconButton.tsx", import.meta.url),
  "utf8"
);
const sidebarSource = readFileSync(new URL("../sidebar/Sidebar.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");

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
        onNavigate: () => undefined,
        onToggleSearch: () => undefined,
        onCreateNode: () => undefined,
        onCreateDefault: async () => undefined,
        onCopyNode: () => undefined,
        onRenameNode: () => undefined,
        onMoveNode: () => undefined,
        onConvertNode: () => undefined,
        pinnedPaths: [],
        onPinnedChange: () => undefined,
        onMoveToTrash: async () => true,
        onSeeRevisions: () => undefined,
        leadingControls: createElement("button", { "aria-label": "Create new" }, "+")
      })
    );

    expect(markup).toContain('aria-label="Current location"');
    expect(markup).toContain('data-rumi-workspace-header=""');
    expect(markup).toContain("bg-background");
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
    expect(markup).toContain("justify-end");
    expect(markup).toContain('data-rumi-header-sidebar-controls=""');
    expect(markup).toContain('aria-label="Create new"');
    expect(markup).not.toContain("absolute left-full");
    expect(markup).toContain('aria-label="File actions"');
    expect(markup).not.toContain(">History<");
    expect(markup).toContain("max-w-[820px]");
    expect(markup).not.toContain("max-w-[1120px]");
  });

  it("renders current-page actions through the shared workspace-item menu", () => {
    expect(headerSource).toContain("<WorkspaceItemMenuItems");
    expect(headerSource).toContain("onCopy={onCopyNode}");
    expect(headerSource).toContain("onPinnedChange={onPinnedChange}");
    expect(headerSource).toContain("onSeeRevisions={onSeeRevisions}");
    expect(headerSource).not.toContain("<DropdownMenuItem");
  });

  it("routes breadcrumb actions through the clicked node and App-owned action hosts", () => {
    expect(headerSource).toContain("node: breadcrumb.node!");
    expect(headerSource).toContain("onCopy={onCopyNode}");
    expect(headerSource).toContain("onRename={onRenameNode}");
    expect(headerSource).toContain("onMove={onMoveNode}");
    expect(appSource).toContain("onRenameNode={setWorkspaceRenameTarget}");
    expect(appSource).toContain("onMoveNode={setWorkspaceMoveTarget}");
    expect(appSource).toContain("onConvertNode={setWorkspaceConvertTarget}");
    expect(appSource).toContain("copyWorkspaceNodeReference(node, action)");
  });

  it("shares one borderless control across create, sidebar, and page actions", () => {
    expect(headerControlSource).toContain("h-8 w-8");
    expect(headerControlSource).toContain("border-0 bg-transparent");
    expect(headerControlSource).not.toContain("transition-");
    expect(headerControlSource).toContain('collapsed ? "regular" : "fill"');
    expect(headerControlSource).toContain('collapsed ? "fill" : "regular"');
    expect(headerControlSource).toContain("group-hover:opacity-0");
    expect(headerControlSource).toContain("group-hover:opacity-100");
    expect(sidebarSource).toContain("<EditorHeaderIconButton aria-label=\"Create new\"");
    expect(appSource).toContain("<EditorHeaderIconButton");
    expect(headerSource).toContain("<EditorHeaderIconButton");
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

  it("shows Uploads as a system-page address", () => {
    expect(workspaceBreadcrumbs("notes", tree, null, "uploads").map((breadcrumb) => (
      breadcrumb.label
    ))).toEqual(["notes", "Uploads"]);
  });
});

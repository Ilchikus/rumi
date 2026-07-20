import { createElement } from "react";
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
      false
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
        trashOpen: false,
        wide: false,
        hasOpenPage: true,
        onNavigate: () => undefined,
        onToggleSearch: () => undefined,
        onMoveNode: async () => true,
        onMoveToTrash: async () => true,
        onSeeRevisions: () => undefined
      })
    );

    expect(markup).toContain('aria-label="Current location"');
    expect(markup).toContain('data-rumi-address-bar=""');
    expect(markup).toMatch(/<button[^>]*>notes<\/button>/u);
    expect(markup).toContain("bg-neutral-100");
    expect(markup).toContain("Launch plan");
    expect(markup).toContain('aria-label="Toggle search (Command K)"');
    expect(markup).toContain("⌘ K");
    expect(markup).toContain('data-rumi-header-actions=""');
    expect(markup).toContain("absolute left-full");
    expect(markup).toContain('aria-label="File actions"');
    expect(markup).not.toContain(">History<");
  });

  it("shows Trash as the current address without treating it as a workspace file", () => {
    expect(workspaceBreadcrumbs("notes", tree, null, true).map(({ label, node, current }) => ({
      label,
      path: node?.path ?? null,
      current
    }))).toEqual([
      { label: "notes", path: "", current: false },
      { label: "Trash", path: null, current: true }
    ]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { workspaceItemActionModel } from "./WorkspaceItemMenu";

const sidebarSource = readFileSync(
  new URL("../sidebar/Sidebar.tsx", import.meta.url),
  "utf8"
);
const headerSource = readFileSync(
  new URL("../layout/WorkspaceHeader.tsx", import.meta.url),
  "utf8"
);
const workspaceItemMenuSource = readFileSync(
  new URL("./WorkspaceItemMenu.tsx", import.meta.url),
  "utf8"
);

function actionIds(node: WorkspaceNode | null): string[] {
  return workspaceItemActionModel(node).map((action) => action.id);
}

describe("workspace-item action model", () => {
  it("returns the ordered page action set", () => {
    expect(actionIds({ path: "Plan.md", name: "Plan.md", kind: "page" })).toEqual([
      "copy-url",
      "copy-relative-path",
      "pin",
      "rename",
      "move",
      "see-revisions",
      "move-to-trash"
    ]);
  });

  it("keeps the folder and database child-creation and conversion matrices", () => {
    expect(actionIds({
      path: "Projects",
      name: "Projects",
      kind: "folder",
      companionPath: "Projects/Projects.index.md"
    })).toEqual([
      "new-page",
      "new-folder",
      "new-database",
      "copy-url",
      "copy-relative-path",
      "pin",
      "rename",
      "move",
      "convert-to-database",
      "see-revisions",
      "move-to-trash"
    ]);
    expect(actionIds({
      path: "Tasks",
      name: "Tasks",
      kind: "database",
      companionPath: "Tasks/Tasks.db.md"
    })).toEqual([
      "new-page",
      "copy-url",
      "copy-relative-path",
      "pin",
      "rename",
      "move",
      "convert-to-folder",
      "see-revisions",
      "move-to-trash"
    ]);
  });

  it("replaces Pin with Unpin for an already pinned item", () => {
    expect(workspaceItemActionModel(
      { path: "Plan.md", name: "Plan.md", kind: "page" },
      { pinned: true }
    ).map((action) => action.id)).toContain("unpin");
    expect(workspaceItemActionModel(
      { path: "Plan.md", name: "Plan.md", kind: "page" },
      { pinned: true }
    ).map((action) => action.id)).not.toContain("pin");
    expect(workspaceItemMenuSource).toContain("return <PushPin size={16} />;");
  });

  it("gives the workspace root only creation and companion-backed copy actions", () => {
    const root: WorkspaceNode = {
      path: "",
      name: "Notes",
      kind: "workspace",
      companionPath: "Notes.index.md"
    };
    expect(actionIds(root)).toEqual([
      "new-page",
      "new-folder",
      "new-database",
      "copy-url",
      "copy-relative-path"
    ]);
    const { companionPath: _companionPath, ...rootWithoutCompanion } = root;
    expect(actionIds(rootWithoutCompanion)).toEqual([
      "new-page",
      "new-folder",
      "new-database"
    ]);
  });

  it("does not attach generic actions to system or immutable file contexts", () => {
    expect(actionIds(null)).toEqual([]);
    expect(actionIds({ path: "raw.bin", name: "raw.bin", kind: "file" })).toEqual([]);
    expect(actionIds({ path: ".assets/photo.png", name: "photo.png", kind: "asset" })).toEqual([]);
  });

  it("uses the shared renderer for sidebar triggers, sidebar pointer menus, and breadcrumbs", () => {
    expect(sidebarSource).toContain("<WorkspaceItemMenuItems");
    expect(sidebarSource).toContain("<FloatingWorkspaceItemMenu");
    expect(headerSource).toContain("<FloatingWorkspaceItemMenu");
    expect(headerSource).not.toContain("<MoveNodeDialog");
  });
});

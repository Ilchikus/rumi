import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync(new URL("./WorkspaceLoadingShell.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../../AuthGate.tsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../../main.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../sidebar/Sidebar.tsx", import.meta.url), "utf8");

describe("workspace loading shell", () => {
  it("keeps application geometry without loading-state copy", () => {
    expect(shellSource).toContain('data-rumi-workspace-shell=""');
    expect(shellSource).toContain("getSavedSidebarWidth");
    expect(shellSource).toContain("sidebarWidthForViewport");
    expect(shellSource).toContain('isNarrow && !sidebarCollapsed ? "blur-sm"');
    expect(authSource).toContain("<WorkspaceLoadingShell />");
    expect(mainSource).toContain("fallback={<WorkspaceLoadingShell />}");
    expect(mainSource).toContain('const appModule = import("./App")');
    expect(appSource).toContain(
      'const rumiBlockEditorModule = import("./components/editor/RumiBlockEditor")'
    );
    expect(appSource).not.toContain("Open a page from the sidebar.");
    expect(authSource).not.toContain("Opening Rumi");
    expect(mainSource).not.toContain("Opening workspace");
    expect(sidebarSource).not.toContain("Loading workspace");
  });
});

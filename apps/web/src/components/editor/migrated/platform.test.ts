// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  migratedEditorPlatform,
  openEditorHref,
  setMigratedEditorPlatform,
  subscribeMigratedEditorPlatform,
  workspaceAssetUrl
} from "./platform";

afterEach(() => {
  vi.restoreAllMocks();
  setMigratedEditorPlatform({
    databaseRefreshRevisions: {},
    workspaceKey: "",
    documentKey: "",
    documents: []
  });
});

describe("migrated editor platform updates", () => {
  it("notifies embedded node views when the database revision changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMigratedEditorPlatform(listener);

    setMigratedEditorPlatform({
      databaseRefreshRevisions: { Tasks: 4 },
      workspaceKey: "/docs",
      documentKey: "Dashboard.md",
      documents: []
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(migratedEditorPlatform().databaseRefreshRevisions).toEqual({ Tasks: 4 });

    unsubscribe();
    setMigratedEditorPlatform({
      databaseRefreshRevisions: { Tasks: 5 },
      workspaceKey: "/docs",
      documentKey: "Dashboard.md",
      documents: []
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("opens external and workspace links in the requested tab", () => {
    const focusedTab = { focus: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(focusedTab);
    const openDocument = vi.fn();
    setMigratedEditorPlatform({
      databaseRefreshRevisions: {},
      workspaceKey: "/docs",
      documentKey: "Dashboard.md",
      documents: [],
      openDocument
    });

    openEditorHref("https://example.com", "current");
    expect(open).toHaveBeenLastCalledWith("https://example.com", "_self", undefined);
    openEditorHref("https://example.com", "new");
    expect(open).toHaveBeenLastCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer"
    );
    expect(focusedTab.focus).toHaveBeenCalledOnce();

    openEditorHref("Notes.md", "new");
    expect(openDocument).toHaveBeenCalledWith("Notes.md", "new");
  });
});

describe("workspace asset URLs", () => {
  const requestedPath = (src: string) =>
    new URL(workspaceAssetUrl(src), "http://rumi.test").searchParams.get("path");

  it("reads percent-encoded Markdown destinations as file names", () => {
    expect(requestedPath(".assets/after%20(1).png")).toBe(".assets/after (1).png");
    expect(requestedPath(".assets/image (23).png")).toBe(".assets/image (23).png");
    expect(requestedPath(".assets/100%.png")).toBe(".assets/100%.png");
  });

  it("leaves external URLs untouched", () => {
    expect(workspaceAssetUrl("https://example.com/a%20b.png")).toBe("https://example.com/a%20b.png");
  });
});

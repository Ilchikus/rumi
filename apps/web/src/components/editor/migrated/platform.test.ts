// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  migratedEditorPlatform,
  openEditorHref,
  setMigratedEditorPlatform,
  subscribeMigratedEditorPlatform
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
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
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

    openEditorHref("Notes.md", "new");
    expect(openDocument).toHaveBeenCalledWith("Notes.md", "new");
  });
});

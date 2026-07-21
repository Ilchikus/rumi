import { afterEach, describe, expect, it, vi } from "vitest";
import {
  migratedEditorPlatform,
  setMigratedEditorPlatform,
  subscribeMigratedEditorPlatform
} from "./platform";

afterEach(() => {
  setMigratedEditorPlatform({
    databaseRefreshRevisions: {},
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
      documentKey: "Dashboard.md",
      documents: []
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(migratedEditorPlatform().databaseRefreshRevisions).toEqual({ Tasks: 4 });

    unsubscribe();
    setMigratedEditorPlatform({
      databaseRefreshRevisions: { Tasks: 5 },
      documentKey: "Dashboard.md",
      documents: []
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});

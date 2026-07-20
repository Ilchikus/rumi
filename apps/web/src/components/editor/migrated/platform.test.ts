import { afterEach, describe, expect, it, vi } from "vitest";
import {
  migratedEditorPlatform,
  setMigratedEditorPlatform,
  subscribeMigratedEditorPlatform
} from "./platform";

afterEach(() => {
  setMigratedEditorPlatform({
    databaseRefreshRevision: 0,
    documentKey: "",
    documents: []
  });
});

describe("migrated editor platform updates", () => {
  it("notifies embedded node views when the database revision changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMigratedEditorPlatform(listener);

    setMigratedEditorPlatform({
      databaseRefreshRevision: 4,
      documentKey: "Dashboard.md",
      documents: []
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(migratedEditorPlatform().databaseRefreshRevision).toBe(4);

    unsubscribe();
    setMigratedEditorPlatform({
      databaseRefreshRevision: 5,
      documentKey: "Dashboard.md",
      documents: []
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});

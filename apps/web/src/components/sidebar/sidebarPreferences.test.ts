import { describe, expect, it } from "vitest";
import {
  readSidebarExpandedPaths,
  shouldRevealSelectionAncestors,
  writeSidebarExpandedPaths
} from "./sidebarPreferences";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); }
  };
}

describe("sidebar expansion preferences", () => {
  it("round-trips expanded paths per workspace", () => {
    const storage = memoryStorage();
    writeSidebarExpandedPaths(storage, "/workspace/one", new Set(["Projects", "Areas/Work"]));

    expect(readSidebarExpandedPaths(storage, "/workspace/one")).toEqual(
      new Set(["Areas/Work", "Projects"])
    );
    expect(readSidebarExpandedPaths(storage, "/workspace/two")).toBeNull();
  });

  it("ignores malformed preferences", () => {
    const storage = memoryStorage();
    storage.setItem("rumi-new-sidebar-expanded:%2Fworkspace", JSON.stringify(["Good", 12]));
    expect(readSidebarExpandedPaths(storage, "/workspace")).toBeNull();
  });

  it("preserves a restored collapsed database for the initial active record", () => {
    expect(shouldRevealSelectionAncestors(true, true)).toBe(false);
    expect(shouldRevealSelectionAncestors(true, false)).toBe(true);
    expect(shouldRevealSelectionAncestors(false, true)).toBe(true);
  });
});

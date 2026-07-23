import { describe, expect, it } from "vitest";
import {
  MAX_DATABASE_COLUMN_WIDTH,
  MIN_DATABASE_COLUMN_WIDTH,
  databaseColumnWidth,
  databaseColumnWidthsStorageKey,
  readDatabaseColumnWidths,
  writeDatabaseColumnWidths
} from "./databasePreferences";

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

describe("database column preferences", () => {
  it("keeps widths separate by workspace, database, and view", () => {
    const storage = memoryStorage();
    writeDatabaseColumnWidths(storage, "/one", "Tasks", "All", { title: 320 });

    expect(readDatabaseColumnWidths(storage, "/one", "Tasks", "All")).toEqual({ title: 320 });
    expect(readDatabaseColumnWidths(storage, "/two", "Tasks", "All")).toEqual({});
    expect(readDatabaseColumnWidths(storage, "/one", "Projects", "All")).toEqual({});
    expect(readDatabaseColumnWidths(storage, "/one", "Tasks", "Board")).toEqual({});
  });

  it("clamps persisted values and falls back to the shared defaults", () => {
    const storage = memoryStorage();
    storage.setItem(
      databaseColumnWidthsStorageKey("/one", "Tasks", "All"),
      JSON.stringify({ title: 20, status: 900, invalid: "wide" })
    );

    const widths = readDatabaseColumnWidths(storage, "/one", "Tasks", "All");
    expect(widths).toEqual({
      title: MIN_DATABASE_COLUMN_WIDTH,
      status: MAX_DATABASE_COLUMN_WIDTH
    });
    expect(databaseColumnWidth({}, "title")).toBe(240);
    expect(databaseColumnWidth({}, "status")).toBe(176);
  });
});

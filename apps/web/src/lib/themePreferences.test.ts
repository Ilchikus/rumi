// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  themePreferenceKey,
  writeThemePreference,
  type ThemeStorage
} from "./themePreferences";

function memoryStorage(initial: Record<string, string> = {}): ThemeStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe("theme preferences", () => {
  it("defaults to Auto and isolates explicit choices by workspace", () => {
    const storage = memoryStorage();

    expect(readThemePreference(storage, "/workspace/one")).toBe("auto");
    writeThemePreference(storage, "/workspace/one", "dark");
    writeThemePreference(storage, "/workspace/two", "light");

    expect(readThemePreference(storage, "/workspace/one")).toBe("dark");
    expect(readThemePreference(storage, "/workspace/two")).toBe("light");
    expect(readThemePreference(storage, "")).toBe("auto");
  });

  it("ignores invalid or inaccessible browser storage", () => {
    const invalid = memoryStorage({
      [themePreferenceKey("/workspace")]: "sepia"
    });
    const inaccessible: ThemeStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      }
    };

    expect(readThemePreference(invalid, "/workspace")).toBe("auto");
    expect(readThemePreference(inaccessible, "/workspace")).toBe("auto");
    expect(() => writeThemePreference(inaccessible, "/workspace", "dark")).not.toThrow();
  });

  it("resolves Auto from the system while explicit choices win", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("applies the resolved class, dataset, and native color scheme", () => {
    const root = document.createElement("html");

    expect(applyTheme(root, "auto", true)).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");

    expect(applyTheme(root, "light", true)).toBe("light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});

export const THEME_PREFERENCE_KEY_PREFIX = "rumi-new-theme";
export const THEME_CHANGE_EVENT = "rumi-theme-change";
export const SYSTEM_DARK_THEME_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function readThemePreference(
  storage: ThemeStorage,
  workspaceRootPath: string
): ThemePreference {
  if (!workspaceRootPath) return "auto";

  try {
    const value = storage.getItem(themePreferenceKey(workspaceRootPath));
    return isThemePreference(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

export function writeThemePreference(
  storage: ThemeStorage,
  workspaceRootPath: string,
  preference: ThemePreference
): void {
  if (!workspaceRootPath) return;

  try {
    storage.setItem(themePreferenceKey(workspaceRootPath), preference);
  } catch {
    // Browser persistence is optional; the active theme can keep working.
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return systemPrefersDark ? "dark" : "light";
}

export function applyTheme(
  root: HTMLElement,
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  const theme = resolveTheme(preference, systemPrefersDark);
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  return theme;
}

export function themePreferenceKey(workspaceRootPath: string): string {
  return `${THEME_PREFERENCE_KEY_PREFIX}:${workspaceRootPath}`;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark";
}

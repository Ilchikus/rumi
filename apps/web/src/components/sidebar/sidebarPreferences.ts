interface PreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function shouldRevealSelectionAncestors(
  hasRestoredExpansionPreference: boolean,
  initialSelection: boolean
): boolean {
  return !hasRestoredExpansionPreference || !initialSelection;
}

export function readSidebarExpandedPaths(
  storage: PreferenceStorage | null,
  workspaceKey: string
): Set<string> | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(sidebarExpandedPathsStorageKey(workspaceKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((path) => typeof path !== "string")) return null;
    return new Set(parsed);
  } catch {
    return null;
  }
}

export function writeSidebarExpandedPaths(
  storage: PreferenceStorage | null,
  workspaceKey: string,
  paths: ReadonlySet<string>
): void {
  if (!storage) return;

  try {
    storage.setItem(
      sidebarExpandedPathsStorageKey(workspaceKey),
      JSON.stringify([...paths].sort())
    );
  } catch {
    // Browser preferences must never block workspace navigation.
  }
}

export function sidebarExpandedPathsStorageKey(workspaceKey: string): string {
  return `rumi-new-sidebar-expanded:${encodeURIComponent(workspaceKey)}`;
}

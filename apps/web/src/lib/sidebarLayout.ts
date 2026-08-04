export const SIDEBAR_WIDTH_KEY = "rumi-new-sidebar-width";
export const SIDEBAR_COLLAPSED_KEY = "rumi-new-sidebar-collapsed";
export const DEFAULT_SIDEBAR_WIDTH = 320;
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 520;

export function getSavedSidebarWidth(): number {
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved
      ? clamp(JSON.parse(saved) as number, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
      : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function getSavedSidebarCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved ? Boolean(JSON.parse(saved)) : false;
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
  } catch {
    // Layout persistence is optional.
  }
}

export function sidebarWidthForViewport(width: number, viewportWidth: number): number {
  return Math.min(
    width,
    viewportWidth < 768 ? Math.max(260, Math.floor(viewportWidth * 0.86)) : MAX_SIDEBAR_WIDTH
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

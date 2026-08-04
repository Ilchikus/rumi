const EDITOR_SCROLL_STATE_KEY = "rumiEditorScrollTop";

interface EditorScrollCanvas {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export function pageScrollKey(path: string): string {
  return `page:${path}`;
}

export function rememberSessionScrollTop(
  positions: Map<string, number>,
  key: string | null,
  scrollTop: number
): void {
  if (!key) return;
  positions.set(key, normalizeScrollTop(scrollTop));
}

export function resolveNavigationScrollTop(
  positions: ReadonlyMap<string, number>,
  key: string | null,
  historyEntryScrollTop?: number
): number {
  if (historyEntryScrollTop !== undefined) {
    return normalizeScrollTop(historyEntryScrollTop);
  }
  return key ? normalizeScrollTop(positions.get(key)) : 0;
}

export function mergeEditorScrollState(
  state: unknown,
  scrollTop: number
): Record<string, unknown> {
  return {
    ...(isRecord(state) ? state : {}),
    [EDITOR_SCROLL_STATE_KEY]: normalizeScrollTop(scrollTop)
  };
}

export function readEditorScrollTop(state: unknown): number {
  if (!isRecord(state)) return 0;
  return normalizeScrollTop(state[EDITOR_SCROLL_STATE_KEY]);
}

export function restoreEditorScroll(
  getCanvas: () => EditorScrollCanvas | null,
  scrollTop: number,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
  maximumFrames = 120
): () => void {
  const target = normalizeScrollTop(scrollTop);
  let frame = 0;
  let attempts = 0;
  let cancelled = false;

  const restore = () => {
    if (cancelled) return;
    attempts += 1;
    const canvas = getCanvas();

    if (canvas) {
      canvas.scrollTop = target;
      const maximumScrollTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
      if (target === 0 || maximumScrollTop >= target - 1 || Math.abs(canvas.scrollTop - target) <= 1) {
        return;
      }
    }

    if (attempts < maximumFrames) frame = requestFrame(restore);
  };

  frame = requestFrame(restore);
  return () => {
    cancelled = true;
    cancelFrame(frame);
  };
}

function normalizeScrollTop(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

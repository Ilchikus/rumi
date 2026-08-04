import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  mergeEditorScrollState,
  pageScrollKey,
  readEditorScrollTop,
  rememberSessionScrollTop,
  resolveNavigationScrollTop,
  restoreEditorScroll
} from "./historyScroll";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("editor history scroll state", () => {
  it("preserves unrelated history state and normalizes scroll positions", () => {
    const state = mergeEditorScrollState({ routeId: "page-1" }, 140.8);

    expect(state).toEqual({ routeId: "page-1", rumiEditorScrollTop: 141 });
    expect(readEditorScrollTop(state)).toBe(141);
    expect(readEditorScrollTop({ rumiEditorScrollTop: -4 })).toBe(0);
    expect(readEditorScrollTop(null)).toBe(0);
  });

  it("retries restoration until delayed editor content can reach the target", () => {
    const frames: FrameRequestCallback[] = [];
    let availableScroll = 0;
    let currentScroll = 0;
    const canvas = {
      clientHeight: 500,
      get scrollHeight() {
        return 500 + availableScroll;
      },
      get scrollTop() {
        return currentScroll;
      },
      set scrollTop(value: number) {
        currentScroll = Math.min(value, availableScroll);
      }
    };

    restoreEditorScroll(
      () => canvas,
      900,
      (callback) => {
        frames.push(callback);
        return frames.length;
      },
      () => undefined,
      4
    );

    frames.shift()?.(0);
    expect(currentScroll).toBe(0);
    availableScroll = 900;
    frames.shift()?.(16);
    expect(currentScroll).toBe(900);
    expect(frames).toHaveLength(0);
  });

  it("restores the latest position when an already visited page is opened again", () => {
    const positions = new Map<string, number>();
    const firstPage = pageScrollKey("/Notes/First.md");
    const secondPage = pageScrollKey("/Notes/Second.md");

    rememberSessionScrollTop(positions, firstPage, 864.6);

    expect(resolveNavigationScrollTop(positions, firstPage)).toBe(865);
    expect(resolveNavigationScrollTop(positions, secondPage)).toBe(0);
  });

  it("prefers an exact browser history entry position over a page's latest position", () => {
    const pageKey = pageScrollKey("/Notes/First.md");
    const positions = new Map([[pageKey, 865]]);

    expect(resolveNavigationScrollTop(positions, pageKey, 312)).toBe(312);
    expect(resolveNavigationScrollTop(positions, pageKey, 0)).toBe(0);
  });

  it("wires scroll state to native history without persistent browser storage", () => {
    expect(appSource).toContain('window.history.scrollRestoration = "manual"');
    expect(appSource).toContain("readEditorScrollTop(event.state)");
    expect(appSource).toContain("mergeEditorScrollState(window.history.state, target.scrollTop)");
    expect(appSource).toContain(
      "sessionScrollPositionsRef = useRef<Map<string, number>>(new Map())"
    );
    expect(appSource).toContain("rememberSessionScrollTop(");
    expect(appSource).toContain("resolveNavigationScrollTop(");
    expect(appSource).toContain("restoreEditorScroll(");
    expect(appSource).not.toContain("sessionStorage");
    expect(appSource).not.toMatch(/localStorage[^\n]+scroll/i);
  });
});

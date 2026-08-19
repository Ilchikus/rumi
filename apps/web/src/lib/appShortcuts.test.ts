import { describe, expect, it } from "vitest";
import {
  appShortcutAction,
  createMenuIndexForKey,
  createMenuNumberAction,
  hasPrimaryModifier,
  shortcutLabels
} from "./appShortcuts";

const baseEvent = {
  key: "",
  code: "",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
};

describe("application shortcuts", () => {
  it("opens create with Control-N on Mac without taking browser Command-N", () => {
    expect(appShortcutAction({
      ...baseEvent,
      key: "n",
      code: "KeyN",
      ctrlKey: true
    }, "mac")).toBe("open-create-menu");
    expect(appShortcutAction({
      ...baseEvent,
      key: "n",
      code: "KeyN",
      metaKey: true
    }, "mac")).toBeNull();
  });

  it("uses Alt-N on Linux without taking browser Control-N", () => {
    expect(appShortcutAction({
      ...baseEvent,
      key: "n",
      code: "KeyN",
      altKey: true
    }, "linux")).toBe("open-create-menu");
    expect(appShortcutAction({
      ...baseEvent,
      key: "n",
      code: "KeyN",
      ctrlKey: true
    }, "linux")).toBeNull();
  });

  it("toggles the sidebar with the platform primary save shortcut", () => {
    expect(appShortcutAction({
      ...baseEvent,
      key: "s",
      code: "KeyS",
      metaKey: true
    }, "mac")).toBe("toggle-sidebar");
    expect(appShortcutAction({
      ...baseEvent,
      key: "s",
      code: "KeyS",
      ctrlKey: true
    }, "linux")).toBe("toggle-sidebar");
  });

  it("copies the open page URL with Shift-Command-C and its non-Mac equivalent", () => {
    expect(appShortcutAction({
      ...baseEvent,
      key: "c",
      code: "KeyC",
      metaKey: true,
      shiftKey: true
    }, "mac")).toBe("copy-page-url");
    expect(appShortcutAction({
      ...baseEvent,
      key: "C",
      code: "KeyC",
      ctrlKey: true,
      shiftKey: true
    }, "linux")).toBe("copy-page-url");
  });

  it("copies the open page path with Shift-Command-P and ignores unsafe variants", () => {
    expect(appShortcutAction({
      ...baseEvent,
      key: "p",
      code: "KeyP",
      metaKey: true,
      shiftKey: true
    }, "mac")).toBe("copy-page-relative-path");
    expect(appShortcutAction({
      ...baseEvent,
      key: "p",
      code: "KeyP",
      ctrlKey: true,
      shiftKey: true
    }, "linux")).toBe("copy-page-relative-path");
    expect(appShortcutAction({
      ...baseEvent,
      key: "p",
      code: "KeyP",
      metaKey: true
    }, "mac")).toBeNull();
    expect(appShortcutAction({
      ...baseEvent,
      key: "p",
      code: "KeyP",
      metaKey: true,
      shiftKey: true,
      repeat: true
    }, "mac")).toBeNull();
    expect(appShortcutAction({
      ...baseEvent,
      key: "p",
      code: "KeyP",
      metaKey: true,
      shiftKey: true,
      isComposing: true
    }, "mac")).toBeNull();
  });

  it("maps unmodified 1, 2, and 3 to create-menu focus positions", () => {
    expect(createMenuIndexForKey({ ...baseEvent, key: "1", code: "Digit1" })).toBe(0);
    expect(createMenuIndexForKey({ ...baseEvent, key: "2", code: "Digit2" })).toBe(1);
    expect(createMenuIndexForKey({ ...baseEvent, key: "3", code: "Digit3" })).toBe(2);
    expect(createMenuIndexForKey({
      ...baseEvent,
      key: "1",
      code: "Digit1",
      metaKey: true
    })).toBeNull();
  });

  it("focuses on the first number press and confirms only a repeated number", () => {
    expect(createMenuNumberAction(
      { ...baseEvent, key: "2", code: "Digit2" },
      null
    )).toEqual({ index: 1, action: "focus" });
    expect(createMenuNumberAction(
      { ...baseEvent, key: "2", code: "Digit2" },
      1
    )).toEqual({ index: 1, action: "create-and-open" });
    expect(createMenuNumberAction(
      { ...baseEvent, key: "3", code: "Digit3" },
      1
    )).toEqual({ index: 2, action: "focus" });
  });

  it("does not capture modified digits reserved by the browser or operating system", () => {
    expect(createMenuNumberAction(
      { ...baseEvent, key: "2", code: "Digit2", metaKey: true },
      1
    )).toBeNull();
    expect(createMenuNumberAction(
      { ...baseEvent, key: "2", code: "Digit2", ctrlKey: true },
      1
    )).toBeNull();
  });

  it("recognizes only the platform primary modifier for immediate creation", () => {
    expect(hasPrimaryModifier({ ...baseEvent, metaKey: true }, "mac")).toBe(true);
    expect(hasPrimaryModifier({ ...baseEvent, ctrlKey: true }, "mac")).toBe(false);
    expect(hasPrimaryModifier({ ...baseEvent, ctrlKey: true }, "linux")).toBe(true);
    expect(hasPrimaryModifier({ ...baseEvent, metaKey: true }, "linux")).toBe(false);
  });

  it("provides discoverable platform labels", () => {
    expect(shortcutLabels("mac")).toEqual({
      create: "⌃N",
      sidebar: "⌘S",
      immediate: "⌘↵",
      copyUrl: "⇧⌘C",
      copyRelativePath: "⇧⌘P"
    });
    expect(shortcutLabels("linux")).toEqual({
      create: "Alt+N",
      sidebar: "Ctrl+S",
      immediate: "Ctrl+Enter",
      copyUrl: "Ctrl+Shift+C",
      copyRelativePath: "Ctrl+Shift+P"
    });
  });
});

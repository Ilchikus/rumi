import { describe, expect, it } from "vitest";
import {
  appShortcutAction,
  createMenuIndexForKey,
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

describe("browser-safe app shortcuts", () => {
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

  it("toggles the sidebar with the platform primary modifier and backquote", () => {
    expect(appShortcutAction({
      ...baseEvent,
      key: "`",
      code: "Backquote",
      metaKey: true
    }, "mac")).toBe("toggle-sidebar");
    expect(appShortcutAction({
      ...baseEvent,
      key: "`",
      code: "Backquote",
      ctrlKey: true
    }, "linux")).toBe("toggle-sidebar");
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

  it("recognizes only the platform primary modifier for immediate creation", () => {
    expect(hasPrimaryModifier({ ...baseEvent, metaKey: true }, "mac")).toBe(true);
    expect(hasPrimaryModifier({ ...baseEvent, ctrlKey: true }, "mac")).toBe(false);
    expect(hasPrimaryModifier({ ...baseEvent, ctrlKey: true }, "linux")).toBe(true);
    expect(hasPrimaryModifier({ ...baseEvent, metaKey: true }, "linux")).toBe(false);
  });

  it("provides discoverable platform labels", () => {
    expect(shortcutLabels("mac")).toEqual({
      create: "⌃N",
      sidebar: "⌘`",
      immediate: "⌘↵"
    });
    expect(shortcutLabels("linux")).toEqual({
      create: "Alt+N",
      sidebar: "Ctrl+`",
      immediate: "Ctrl+Enter"
    });
  });
});

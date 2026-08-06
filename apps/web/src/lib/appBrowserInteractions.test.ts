// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  hasTextEditingFocus,
  isSecondaryContextGesture,
  isSelectAllShortcut
} from "./appBrowserInteractions";

const keyboardEvent = {
  key: "a",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
};

describe("app browser interaction guards", () => {
  it("recognizes the platform select-all shortcut", () => {
    expect(isSelectAllShortcut({ ...keyboardEvent, metaKey: true }, "mac")).toBe(true);
    expect(isSelectAllShortcut({ ...keyboardEvent, ctrlKey: true }, "linux")).toBe(true);
    expect(isSelectAllShortcut({ ...keyboardEvent, ctrlKey: true }, "mac")).toBe(false);
  });

  it("keeps select-all native while a text caret can be active", () => {
    const input = document.createElement("input");
    const button = document.createElement("input");
    button.type = "button";
    const editable = document.createElement("div");
    editable.contentEditable = "true";

    expect(hasTextEditingFocus(input)).toBe(true);
    expect(hasTextEditingFocus(editable)).toBe(true);
    expect(hasTextEditingFocus(button)).toBe(false);
    expect(hasTextEditingFocus(document.body)).toBe(false);
  });

  it("recognizes right-click and macOS Control-click", () => {
    expect(isSecondaryContextGesture({ button: 2 } as MouseEvent, "linux")).toBe(true);
    expect(isSecondaryContextGesture(
      { button: 0, ctrlKey: true } as MouseEvent,
      "mac"
    )).toBe(true);
    expect(isSecondaryContextGesture(
      { button: 0, ctrlKey: true } as MouseEvent,
      "linux"
    )).toBe(false);
  });
});

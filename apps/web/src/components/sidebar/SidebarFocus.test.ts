// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  focusFirstSidebarMenuItem,
  moveSidebarMenuFocus,
  restoreSidebarContextFocus
} from "./Sidebar";

function menuItem(label: string, disabled = false): HTMLElement {
  const item = document.createElement("div");
  item.setAttribute("role", "menuitem");
  item.tabIndex = -1;
  item.textContent = label;
  if (disabled) item.setAttribute("data-disabled", "");
  return item;
}

describe("sidebar context-menu focus helpers", () => {
  it("focuses the first enabled item, skips disabled items, and wraps in either direction", () => {
    const menu = document.createElement("div");
    const disabled = menuItem("Disabled", true);
    const first = menuItem("First");
    const second = menuItem("Second");
    const third = menuItem("Third");
    menu.append(disabled, first, second, third);
    document.body.appendChild(menu);

    expect(focusFirstSidebarMenuItem(menu)).toBe(first);
    expect(document.activeElement).toBe(first);
    expect(moveSidebarMenuFocus(menu, "next")).toBe(second);
    expect(document.activeElement).toBe(second);
    expect(moveSidebarMenuFocus(menu, "next")).toBe(third);
    expect(moveSidebarMenuFocus(menu, "next")).toBe(first);
    expect(moveSidebarMenuFocus(menu, "previous")).toBe(third);

    menu.remove();
  });

  it("activates exactly the focused action through the browser Enter click contract", () => {
    const menu = document.createElement("div");
    const first = menuItem("First");
    const second = menuItem("Second");
    const firstAction = vi.fn();
    const secondAction = vi.fn();
    first.addEventListener("click", firstAction);
    second.addEventListener("click", secondAction);
    menu.append(first, second);
    document.body.appendChild(menu);

    focusFirstSidebarMenuItem(menu);
    moveSidebarMenuFocus(menu, "next");
    (document.activeElement as HTMLElement).click();

    expect(firstAction).not.toHaveBeenCalled();
    expect(secondAction).toHaveBeenCalledTimes(1);
    menu.remove();
  });

  it("restores focus only while the originating row control still exists", () => {
    const origin = document.createElement("button");
    document.body.appendChild(origin);

    expect(restoreSidebarContextFocus(origin)).toBe(true);
    expect(document.activeElement).toBe(origin);

    origin.remove();
    expect(restoreSidebarContextFocus(origin)).toBe(false);
  });
});

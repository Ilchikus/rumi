// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSavedIconColor, saveIconColor } from "../../lib/workspaceIcons";
import { IconPickerDialog } from "./IconPickerDialog";
import { PageIconHeader } from "./PageIconHeader";
import { loadEmojiCatalog } from "../emoji/emojiCatalogLoader";
import { loadPhosphorCatalog } from "./phosphorCatalog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll("[data-radix-focus-guard]").forEach((element) => element.remove());
  window.localStorage.clear();
  root = null;
  container = null;
});

async function renderPicker(currentIcon?: string) {
  await Promise.all([loadEmojiCatalog(), loadPhosphorCatalog()]);
  const onSelect = vi.fn();
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(IconPickerDialog, {
      itemName: "Plan",
      currentIcon,
      onOpenChange: () => undefined,
      onSelect,
      onUpload: async () => ".assets/icon.png"
    }));
  });
  return onSelect;
}

function click(element: Element | null | undefined) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function search(query: string) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Search icons"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function colorOption(name: string) {
  return document.querySelector(`[data-icon-color-picker] [role="radio"][aria-label="${name}"]`);
}

describe("icon picker colors", () => {
  it("shows the color palette only for Phosphor icons and starts from the saved color", async () => {
    saveIconColor("teal");
    await renderPicker();
    expect(document.querySelector("[data-icon-color-picker]")).toBeNull();

    click(Array.from(document.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent === "Icons"));
    expect(colorOption("teal")?.getAttribute("aria-checked")).toBe("true");
    expect(colorOption("neutral")?.getAttribute("aria-checked")).toBe("false");
  });

  it("saves the picked color and writes it into the chosen icon", async () => {
    const onSelect = await renderPicker("ph:rocket:blue");
    click(colorOption("rose"));
    expect(getSavedIconColor()).toBe("rose");

    search("rocket");
    const rocket = document.querySelector('[role="option"][aria-label="rocket"]');
    expect(rocket?.getAttribute("aria-selected")).toBe("true");
    click(rocket);
    expect(onSelect).toHaveBeenCalledWith("ph:rocket:rose");
  });

  it("writes plain ph:<name> for the neutral default", async () => {
    const onSelect = await renderPicker("ph:rocket");
    click(colorOption("neutral"));
    search("rocket");
    click(document.querySelector('[role="option"][aria-label="rocket"]'));
    expect(onSelect).toHaveBeenCalledWith("ph:rocket");
  });
});

describe("page icon header", () => {
  it("puts the icon and the Add icon control in the same square slot above the title", () => {
    const slot = (markup: string, attribute: string) =>
      new DOMParser().parseFromString(markup, "text/html").querySelector(`[${attribute}]`)!.className;
    const iconSlot = slot(
      renderToStaticMarkup(createElement(PageIconHeader, { icon: "🚀", onChangeIcon: () => undefined })),
      "data-page-icon"
    );
    const addSlot = slot(
      renderToStaticMarkup(createElement(PageIconHeader, { icon: undefined, onChangeIcon: () => undefined })),
      "data-page-add-icon"
    );

    const slotClass = "absolute bottom-3 left-0 -ml-1.5 grid place-items-center rounded-lg p-1.5";
    expect(iconSlot).toContain(slotClass);
    expect(addSlot).toContain(slotClass);
  });
});

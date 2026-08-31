// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { WorkspaceHeader } from "./WorkspaceHeader";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const page: WorkspaceNode = {
  path: "Projects/Launch plan.md",
  name: "Launch plan.md",
  kind: "page"
};
const folder: WorkspaceNode = {
  path: "Projects",
  name: "Projects",
  kind: "folder",
  companionPath: "Projects/Projects.index.md",
  children: [page]
};
const tree: WorkspaceNode = {
  path: "",
  name: "Notes",
  kind: "workspace",
  companionPath: "Notes.index.md",
  children: [folder]
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: "MacIntel"
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll("[data-radix-focus-guard]").forEach((element) => element.remove());
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe("workspace breadcrumb context actions", () => {
  it("opens on right-click without navigating and activates the clicked ancestor", async () => {
    const onNavigate = vi.fn();
    const onRenameNode = vi.fn();
    await renderHeader({ onNavigate, onRenameNode });
    const origin = breadcrumbButton("Projects");

    await dispatchMouse(origin, "contextmenu", { button: 2, clientX: 80, clientY: 24 });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(menuLabels()).toEqual([
      "New Page",
      "New Folder",
      "New Database",
      "Copy URL",
      "Copy relative path",
      "Pin",
      "Rename",
      "Move",
      "Convert to database",
      "See revisions",
      "Move to Trash"
    ]);

    const rename = menuItem("Rename");
    await act(async () => rename.focus());
    await dispatchKey(rename, "Enter");
    expect(onRenameNode).toHaveBeenCalledTimes(1);
    expect(onRenameNode).toHaveBeenCalledWith(folder);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("handles macOS Control-click and restores focus after Escape", async () => {
    const onNavigate = vi.fn();
    await renderHeader({ onNavigate });
    const origin = breadcrumbButton("Projects");
    const focusSpy = vi.spyOn(origin, "focus");

    await dispatchMouse(origin, "mousedown", {
      button: 0,
      ctrlKey: true,
      clientX: 64,
      clientY: 20
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("New Page");

    await dispatchKey(document.activeElement as HTMLElement, "Escape");
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(origin);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

    await dispatchMouse(origin, "click", { button: 0 });
    expect(onNavigate).toHaveBeenCalledWith(folder);
  });

  it("runs Pin for the active page through the same shared header menu", async () => {
    const onPinnedChange = vi.fn();
    await renderHeader({ onPinnedChange });
    const trigger = container!.querySelector<HTMLElement>('[aria-label="File actions"]');
    if (!trigger) throw new Error("File actions did not render");

    await dispatchMouse(trigger, "pointerdown", { button: 0 });
    await dispatchMouse(trigger, "click", { button: 0 });
    await dispatchKey(menuItem("Pin"), "Enter");

    expect(onPinnedChange).toHaveBeenCalledTimes(1);
    expect(onPinnedChange).toHaveBeenCalledWith(page, true);
  });

  it("keeps system breadcrumb labels inert", async () => {
    await renderHeader({ systemView: "uploads" });
    const uploads = Array.from(container!.querySelectorAll("span"))
      .find((element) => element.textContent === "Uploads");
    if (!uploads) throw new Error("Uploads breadcrumb did not render");

    await dispatchMouse(uploads, "contextmenu", { button: 2 });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});

async function renderHeader(overrides: Record<string, unknown> = {}): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(createElement(WorkspaceHeader, {
      workspaceName: "Notes",
      tree,
      selection: { nodePath: page.path, openPath: page.path, kind: "page" },
      systemView: null,
      onNavigate: () => undefined,
      onToggleSearch: () => undefined,
      onCreateNode: () => undefined,
      onCreateDefault: async () => undefined,
      onCopyNode: () => undefined,
      onRenameNode: () => undefined,
      onMoveNode: () => undefined,
      onConvertNode: () => undefined,
      pinnedPaths: [],
      onPinnedChange: () => undefined,
      onMoveToTrash: async () => true,
      onSeeRevisions: () => undefined,
      leadingControls: null,
      ...overrides
    }));
    await Promise.resolve();
  });
}

function breadcrumbButton(label: string): HTMLButtonElement {
  const button = Array.from(container!.querySelectorAll("button"))
    .find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`${label} breadcrumb did not render`);
  return button;
}

function menuLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .map((item) => item.textContent?.trim() ?? "");
}

function menuItem(label: string): HTMLElement {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!item) throw new Error(`${label} menu item did not render`);
  return item;
}

async function dispatchMouse(
  target: Element,
  type: string,
  init: MouseEventInit
): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function dispatchKey(target: HTMLElement, key: string): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { setPinnedItemPath } from "../../lib/pinnedItems";
import { Sidebar } from "./Sidebar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const page: WorkspaceNode = {
  path: "Projects/Plan.md",
  name: "Plan.md",
  kind: "page"
};
const tree: WorkspaceNode = {
  path: "",
  name: "Notes",
  kind: "workspace",
  companionPath: "Notes.index.md",
  children: [{
    path: "Projects",
    name: "Projects",
    kind: "folder",
    companionPath: "Projects/Projects.index.md",
    children: [page]
  }]
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  localStorage.clear();
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

describe("sidebar pinned items", () => {
  it("pins from the canonical row and unpins from the unlabeled projection", async () => {
    await renderSidebar();
    expect(document.querySelector("[data-sidebar-pinned-items]")).toBeNull();

    await openContextMenu(rowFor("Plan"));
    await activateMenuItem("Pin");

    const pinnedSection = document.querySelector<HTMLElement>("[data-sidebar-pinned-items]");
    expect(pinnedSection).not.toBeNull();
    expect(pinnedSection?.querySelector('[aria-label="Open Plan"]')).not.toBeNull();
    expect(pinnedSection?.textContent).toBe("Plan");
    expect(container?.textContent).not.toContain("Pinned items");

    await openContextMenu(rowFor("Plan", pinnedSection!));
    await activateMenuItem("Unpin");
    expect(document.querySelector("[data-sidebar-pinned-items]")).toBeNull();
  });

  it("shows a pinned descendant nested beneath its pinned parent immediately", async () => {
    await renderSidebar(["Projects", page.path]);
    const pinnedSection = document.querySelector<HTMLElement>("[data-sidebar-pinned-items]");
    if (!pinnedSection) throw new Error("Pinned items did not render");

    const parentRow = rowFor("Projects", pinnedSection);
    const pageRow = rowFor("Plan", pinnedSection);
    expect(parentRow.style.paddingLeft).toBe("14px");
    expect(pageRow.style.paddingLeft).toBe("34px");
    expect(parentRow.querySelector('[aria-label="Collapse"]')).not.toBeNull();
  });

  it("pins and unpins from the direct row control without opening an item", async () => {
    const onOpenNode = vi.fn();
    await renderSidebar([], onOpenNode);

    const canonicalPin = rowFor("Plan").querySelector<HTMLButtonElement>(
      '[aria-label="Pin Plan"]'
    );
    expect(canonicalPin).not.toBeNull();
    expect(canonicalPin?.className).toContain("opacity-0");
    expect(canonicalPin?.className).toContain("group-hover:opacity-100");
    const menuTrigger = rowFor("Plan").querySelector('[aria-label="Actions for Plan"]');
    expect(menuTrigger?.nextElementSibling).toBe(canonicalPin);

    await click(canonicalPin!);
    expect(onOpenNode).not.toHaveBeenCalled();

    const pinnedSection = document.querySelector<HTMLElement>("[data-sidebar-pinned-items]");
    if (!pinnedSection) throw new Error("Pinned items did not render");
    const pinnedControl = rowFor("Plan", pinnedSection).querySelector<HTMLButtonElement>(
      '[aria-label="Unpin Plan"]'
    );
    expect(pinnedControl).not.toBeNull();
    expect(pinnedControl?.className).toContain("opacity-0");
    expect(pinnedControl?.className).toContain("group-hover:opacity-100");
    expect(pinnedControl?.getAttribute("aria-pressed")).toBe("true");

    const canonicalPinnedControl = Array.from(
      container!.querySelectorAll<HTMLButtonElement>('[aria-label="Unpin Plan"]')
    ).find((control) => !control.closest("[data-sidebar-pinned-items]"));
    expect(canonicalPinnedControl).toBeDefined();
    expect(canonicalPinnedControl?.className).toContain("opacity-100");
    expect(canonicalPinnedControl?.className).not.toContain("opacity-0");

    await click(pinnedControl!);
    expect(document.querySelector("[data-sidebar-pinned-items]")).toBeNull();
    expect(onOpenNode).not.toHaveBeenCalled();
  });
});

async function renderSidebar(
  initialPinnedPaths: string[] = [],
  onOpenNode: (node: WorkspaceNode) => void = () => undefined
): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  function Harness() {
    const [pinnedPaths, setPinnedPaths] = useState<string[]>(initialPinnedPaths);
    return createElement(Sidebar, {
      workspaceName: "Notes",
      workspaceKey: "/notes",
      tree,
      selection: null,
      trashCount: 0,
      trashOpen: false,
      mediaOpen: false,
      settingsOpen: false,
      createTarget: null,
      onCreateTargetChange: () => undefined,
      onPrefetchNode: () => undefined,
      onOpenNode,
      onCreatePage: async () => undefined,
      onCreateFolder: async () => undefined,
      onCreateDatabase: async () => undefined,
      onCreateDefault: async () => undefined,
      onCopyNode: () => undefined,
      onRenameNode: async () => true,
      onRequestRenameNode: () => undefined,
      onMoveNode: () => undefined,
      onConvertNode: () => undefined,
      pinnedPaths,
      onPinnedChange: (node, pinned) => {
        setPinnedPaths((current) => setPinnedItemPath(current, node.path, pinned));
      },
      onSeeRevisions: () => undefined,
      onDeleteNode: async () => true,
      onOpenSettings: () => undefined,
      onOpenMedia: () => undefined,
      onOpenTrash: () => undefined,
      settingsShortcut: "⌘,",
      trashShortcut: "⇧⌘T"
    });
  }

  await act(async () => {
    root?.render(createElement(Harness));
    await Promise.resolve();
  });
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function rowFor(label: string, scope: ParentNode = container!): HTMLElement {
  const button = scope.querySelector<HTMLElement>(`[aria-label="Open ${label}"]`);
  const row = button?.closest<HTMLElement>("[data-sidebar-node='true']");
  if (!row) throw new Error(`${label} row did not render`);
  return row;
}

async function openContextMenu(row: HTMLElement): Promise<void> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 80,
      clientY: 24
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function activateMenuItem(label: string): Promise<void> {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!item) throw new Error(`${label} menu item did not render`);

  await act(async () => {
    item.focus();
    item.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

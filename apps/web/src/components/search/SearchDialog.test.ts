// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RumiApiClient } from "@rumi/api-client";
import type { SearchWorkspaceResult, WorkspaceNode } from "@rumi/contracts";
import { recordRecentDocument } from "../../lib/recentDocuments";
import { SearchDialog } from "./SearchDialog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const tree: WorkspaceNode = {
  path: "",
  name: "Notes",
  kind: "workspace",
  companionPath: "Notes.index.md",
  children: [
    { path: "Loose.md", name: "Loose.md", kind: "page" },
    {
      path: "Projects",
      name: "Projects",
      kind: "folder",
      companionPath: "Projects/Projects.index.md",
      children: [
        { path: "Projects/Plan.md", name: "Plan.md", kind: "page" }
      ]
    }
  ]
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll("[data-radix-focus-guard]").forEach((element) => element.remove());
  window.localStorage.clear();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe("workspace search dialog", () => {
  it("cycles all tabs in both directions while retaining query, input focus, and reset selection", async () => {
    recordRecentDocument(window.localStorage, "/workspace", tree.children![0]!);
    recordRecentDocument(window.localStorage, "/workspace", tree.children![1]!.children![0]!);
    recordRecentDocument(window.localStorage, "/workspace", tree.children![1]!);
    const searchWorkspace = vi.fn(async (): Promise<SearchWorkspaceResult> => ({ query: "", items: [] }));

    await renderSearchDialog(searchWorkspace);
    const input = searchInput();
    expect(document.querySelector('[role="tablist"]')).not.toBeNull();
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(activeTab()?.textContent).toBe("All");

    for (const label of ["Pages", "Folders", "Databases", "Recent", "All"]) {
      await pressKey(input, "Tab");
      expect(activeTab()?.textContent).toBe(label);
      expect(document.activeElement).toBe(input);
    }

    await pressKey(input, "Tab", { shiftKey: true });
    expect(activeTab()?.textContent).toBe("Recent");
    await act(async () => {
      const tab = activeTab();
      tab?.focus();
      tab?.dispatchEvent(new KeyboardEvent("keyup", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
        shiftKey: true
      }));
    });
    expect(document.activeElement).toBe(input);
    await changeInput(input, "p");
    expect(input.value).toBe("p");
    expect(resultOptions().map((option) => option.textContent)).toEqual([
      expect.stringContaining("Projects"),
      expect.stringContaining("Plan")
    ]);

    await pressKey(input, "ArrowDown");
    expect(resultOptions()[1]?.getAttribute("aria-selected")).toBe("true");
    await pressKey(input, "Tab");
    expect(activeTab()?.textContent).toBe("All");
    await pressKey(input, "Tab", { shiftKey: true });

    expect(activeTab()?.textContent).toBe("Recent");
    expect(input.value).toBe("p");
    expect(document.activeElement).toBe(input);
    expect(resultOptions()[0]?.getAttribute("aria-selected")).toBe("true");
    expect(searchWorkspace).not.toHaveBeenCalled();
  });

  it("keeps Recent local while indexed tabs retain filters, debounce, and stale-response protection", async () => {
    recordRecentDocument(window.localStorage, "/workspace", tree.children![1]!.children![0]!);
    const oldResult = deferred<SearchWorkspaceResult>();
    const newResult = deferred<SearchWorkspaceResult>();
    const searchWorkspace = vi.fn()
      .mockReturnValueOnce(oldResult.promise)
      .mockReturnValueOnce(newResult.promise);

    await renderSearchDialog(searchWorkspace);
    const input = searchInput();
    await pressKey(input, "Tab", { shiftKey: true });
    await changeInput(input, "plan");
    await waitForDebounce();

    expect(activeTab()?.textContent).toBe("Recent");
    expect(searchWorkspace).not.toHaveBeenCalled();
    expect(resultOptions()[0]?.textContent).toContain("Plan");

    await pressKey(input, "Tab");
    await pressKey(input, "Tab");
    expect(activeTab()?.textContent).toBe("Pages");
    await waitForDebounce();
    expect(searchWorkspace).toHaveBeenCalledTimes(1);
    expect(searchWorkspace).toHaveBeenLastCalledWith({
      query: "plan",
      kinds: ["page"],
      limit: 50
    });

    await changeInput(input, "new");
    await waitForDebounce();
    expect(searchWorkspace).toHaveBeenCalledTimes(2);

    await act(async () => {
      newResult.resolve({
        query: "new",
        items: [{ path: "New.md", title: "New", kind: "page", snippet: "new", score: 2 }]
      });
      await Promise.resolve();
    });
    expect(resultOptions()[0]?.textContent).toContain("New");

    await act(async () => {
      oldResult.resolve({
        query: "plan",
        items: [{ path: "Old.md", title: "Old", kind: "page", snippet: "old", score: 1 }]
      });
      await Promise.resolve();
    });
    expect(resultOptions()[0]?.textContent).toContain("New");
    expect(document.body.textContent).not.toContain("Old.md");
  });
});

async function renderSearchDialog(searchWorkspace: ReturnType<typeof vi.fn>): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const api = { searchWorkspace } as unknown as RumiApiClient;

  await act(async () => {
    root?.render(createElement(SearchDialog, {
      api,
      tree,
      workspaceRootPath: "/workspace",
      open: true,
      onOpenChange: () => undefined,
      onOpenItem: () => undefined,
      onMessage: () => undefined
    }));
    await Promise.resolve();
  });
}

function searchInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    'input[placeholder="Search pages, folders, databases, properties, and content"]'
  );
  if (!input) throw new Error("Search input did not render");
  return input;
}

function activeTab(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
}

function resultOptions(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'));
}

async function changeInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressKey(
  target: HTMLElement,
  key: string,
  options: KeyboardEventInit = {}
): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options
    }));
  });
}

async function waitForDebounce(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 140));
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

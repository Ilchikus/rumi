import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TrashItem } from "@rumi/contracts";
import { TrashView } from "./TrashView";

const viewSource = readFileSync(new URL("./TrashView.tsx", import.meta.url), "utf8");

const item: TrashItem = {
  id: "trash-1",
  name: "Deleted page",
  kind: "page",
  originalPath: "Deleted page.md",
  deletedAt: "2026-07-27T12:00:00.000Z"
};

describe("TrashView", () => {
  it("uses the editor page layout with compact kind metadata and ghost actions", () => {
    const markup = renderToStaticMarkup(
      createElement(TrashView, {
        items: [item],
        loadState: "idle",
        restoringId: null,
        deletingId: null,
        onOpen: vi.fn(),
        onRestore: vi.fn(),
        onDeleteForever: vi.fn()
      })
    );

    expect(markup).toContain("space-y-3");
    expect(markup).toContain('data-rumi-system-page="Trash"');
    expect(markup).not.toContain("divide-y");
    expect(markup).not.toContain("border-border");
    expect(markup).not.toContain("h-10 w-10");
    expect(markup).not.toContain("h-9 w-9");
    expect(markup).not.toContain("hover:bg-muted");
    expect(markup).toContain("class=\"flex flex-col gap-2 py-2");
    expect(markup).toContain("group min-w-0 flex-1 py-1.5");
    expect(markup).toContain("group-hover:underline");
    expect(markup).toContain("Restore");
    expect(markup).toContain("Delete");
    expect(markup).not.toContain("Delete forever");
    expect(viewSource).toContain("forever. This action is irreversible.");
    expect(markup).toContain("hover:text-destructive");
    expect(markup).toContain("Deleted page.md");
    expect(markup).toContain("Command/Control-click to restore and open");
    expect(viewSource).toContain("isViewableItem(item.kind) && (event.metaKey || event.ctrlKey)");
  });
});

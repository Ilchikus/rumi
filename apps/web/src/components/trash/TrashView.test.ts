import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TrashItem } from "@rumi/contracts";
import { TrashView } from "./TrashView";

const item: TrashItem = {
  id: "trash-1",
  name: "Deleted page",
  kind: "page",
  originalPath: "Deleted page.md",
  deletedAt: "2026-07-27T12:00:00.000Z"
};

describe("TrashView", () => {
  it("uses a whitespace list with open, restore, and permanent-delete actions", () => {
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
    expect(markup).not.toContain("divide-y");
    expect(markup).not.toContain("border-border");
    expect(markup).toContain("Restore");
    expect(markup).toContain("Delete forever");
    expect(markup).toContain("Deleted page.md");
  });
});

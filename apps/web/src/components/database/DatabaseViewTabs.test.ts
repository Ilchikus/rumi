import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DatabaseViewTabs } from "./DatabaseViewTabs";

describe("database view tabs", () => {
  it("renders multiple same-type views as accessible pills", () => {
    const markup = renderToStaticMarkup(createElement(DatabaseViewTabs, {
      views: [
        { id: "all", name: "All", type: "table", columns: ["status"] },
        { id: "doing", name: "Doing", type: "table", columns: ["status"] }
      ],
      activeViewId: "all",
      onSelect: () => undefined,
      onCreate: () => undefined,
      onRename: async () => true,
      onDuplicate: () => undefined,
      onDelete: () => undefined
    }));

    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/gu)).toHaveLength(2);
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-database-view-tab-active="true"');
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("h-10");
    expect(markup).toContain("h-8");
    expect(markup).not.toContain("overflow-y-hidden pb-2");
    expect(markup).toContain("border-transparent bg-neutral-100");
    expect(markup).toContain("border-border bg-white");
    expect(markup).toContain("font-semibold text-neutral-900");
    expect(markup).not.toContain("rounded-t-lg");
    expect(markup).not.toContain("translate-x");
    expect(markup).not.toContain("data-database-tab-outward-corner");
    const firstTab = markup.match(
      /<div[^>]*data-database-view-tab-index="0"[^>]*>/u
    )?.[0] ?? "";
    expect(firstTab).toContain("h-10");
    expect(firstTab).toContain("border-transparent bg-neutral-100");
    expect(markup).not.toContain("-ml-2");
    expect(markup).not.toContain("pl-2");
    const secondTab = markup.match(
      /<div[^>]*data-database-view-tab-index="1"[^>]*>/u
    )?.[0] ?? "";
    expect(secondTab).toContain("h-10");
    expect(secondTab).toContain("border-border bg-white");
    const addView = markup.match(
      /<button[^>]*aria-label="Add database view"[^>]*>/u
    )?.[0] ?? "";
    expect(addView).toContain("bg-transparent");
    expect(addView).toContain("h-8 w-8");
    expect(addView).toContain("hover:bg-neutral-100");
    expect(addView).not.toContain("border");
  });
});

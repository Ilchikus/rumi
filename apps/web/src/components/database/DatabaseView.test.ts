import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RumiApiClient } from "@rumi/api-client";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  DATABASE_RECORD_BATCH_SIZE,
  DatabaseView,
  databaseColumnWidthClass,
  databaseRecordMoveDestinations,
  databaseRecordsForDisplay
} from "./DatabaseView";
import {
  bumpDatabaseRefreshRevision,
  databaseRefreshRevisionFor
} from "./databaseRefresh";

describe("database table presentation", () => {
  it("uses a borderless, unrestricted-height horizontal scroll frame without a manual refresh action", () => {
    const markup = renderToStaticMarkup(createElement(DatabaseView, {
      api: {} as RumiApiClient,
      databasePath: "Projects",
      refreshRevision: 0,
      onOpenRecord: () => undefined,
      onMessage: () => undefined,
      toolbarStart: createElement("span", { "data-database-source": "true" }, "Projects")
    }));
    const section = markup.match(/<section[^>]*aria-label="Database records"[^>]*>/u)?.[0] ?? "";
    const scrollFrame = markup.match(/<div[^>]*data-database-table-scroll="true"[^>]*>/u)?.[0] ?? "";
    const table = markup.match(/<table[^>]*>/u)?.[0] ?? "";
    const tableHeader = markup.match(/<thead[^>]*>/u)?.[0] ?? "";
    const selectionHeader = markup.match(/<th[^>]*data-database-selection-column="true"[^>]*>/u)?.[0] ?? "";

    expect(markup).not.toContain(">Refresh<");
    expect(markup).toContain('data-database-source="true"');
    expect(section).toContain("w-full min-w-0 max-w-full");
    expect(section).not.toContain("border-y");
    expect(scrollFrame).not.toContain("max-h-");
    expect(scrollFrame).toContain("overflow-x-auto");
    expect(scrollFrame).not.toContain("overflow-y-hidden");
    expect(scrollFrame).not.toContain("rounded-md");
    expect(scrollFrame).not.toContain("border-border");
    expect(table).toContain("w-max");
    expect(table).toContain("min-w-[max(100%,620px)]");
    expect(tableHeader).toContain("sticky top-0 z-10");
    expect(tableHeader).toContain("bg-muted");
    expect(selectionHeader).not.toContain("border-r");
    expect(selectionHeader).toContain("min-w-10");
    expect(markup).not.toContain("border-r ");
    expect(markup).toContain("w-60 min-w-60");
    expect(markup).toContain("w-12 min-w-12 max-w-12");
    expect(markup).toContain('data-database-selection-column="true"');
    expect(markup).toContain('aria-label="Select all records"');
    expect(markup).toContain("accent-sky-600");
    expect(databaseColumnWidthClass("title")).toBe("w-60 min-w-60");
    expect(databaseColumnWidthClass("status")).toBe("w-44 min-w-44");
  });

  it("reveals database records in batches of twenty", () => {
    const records = Array.from({ length: 45 }, (_, index) => `record-${index + 1}`);

    expect(DATABASE_RECORD_BATCH_SIZE).toBe(20);
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE)).toEqual(records.slice(0, 20));
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE * 2)).toEqual(records.slice(0, 40));
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE * 3)).toEqual(records);
  });

  it("refreshes only the database named by an event", () => {
    const tasksChanged = bumpDatabaseRefreshRevision({}, "Tasks");
    const decisionsChanged = bumpDatabaseRefreshRevision(tasksChanged, "Decisions");

    expect(databaseRefreshRevisionFor(tasksChanged, "Tasks")).toBe(1);
    expect(databaseRefreshRevisionFor(tasksChanged, "Decisions")).toBe(0);
    expect(databaseRefreshRevisionFor(decisionsChanged, "Tasks")).toBe(1);
    expect(databaseRefreshRevisionFor(decisionsChanged, "Decisions")).toBe(1);
    expect(databaseRefreshRevisionFor(bumpDatabaseRefreshRevision(decisionsChanged), "Tasks")).toBe(2);
  });

  it("offers workspace containers as move destinations and marks the current database", () => {
    const tree: WorkspaceNode = {
      path: "",
      name: "Docs",
      kind: "workspace",
      children: [
        { path: "Projects", name: "Projects", kind: "database" },
        {
          path: "Archive",
          name: "Archive",
          kind: "folder",
          children: [
            { path: "Archive/Ideas", name: "Ideas", kind: "database" },
            { path: "Archive/Readme.md", name: "Readme.md", kind: "page" }
          ]
        }
      ]
    };

    const destinations = databaseRecordMoveDestinations(tree, "Projects");

    expect(destinations.map((destination) => destination.path)).toEqual([
      "",
      "Projects",
      "Archive",
      "Archive/Ideas"
    ]);
    expect(destinations.find((destination) => destination.path === "Projects")?.disabled).toBe(true);
    expect(destinations.find((destination) => destination.path === "Archive")?.disabled).toBe(false);
  });
});

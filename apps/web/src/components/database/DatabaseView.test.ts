import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RumiApiClient } from "@rumi/api-client";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  DATABASE_RECORD_BATCH_SIZE,
  DATABASE_RECORD_NAME_LAYOUT_CLASS,
  DatabaseView,
  databaseColumnWidthClass,
  databaseColumnStyle,
  databaseRecordTitleFromPath,
  databaseRecordMoveDestinations,
  databaseRecordsForDisplay
} from "./DatabaseView";
import {
  bumpDatabaseRefreshRevision,
  databaseRefreshRevisionFor
} from "./databaseRefresh";

const databaseViewSource = readFileSync(new URL("./DatabaseView.tsx", import.meta.url), "utf8");

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
    expect(markup).toContain("border-b border-r border-border");
    expect(markup).toContain("w-60 min-w-60");
    expect(markup).toContain("w-12 min-w-12 max-w-12");
    expect(markup).toContain('data-database-selection-column="true"');
    expect(markup).toContain('aria-label="Select all records"');
    expect(markup).toContain("accent-sky-600");
    expect(databaseColumnWidthClass("title")).toBe("w-60 min-w-60");
    expect(databaseColumnWidthClass("status")).toBe("w-44 min-w-44");
    expect(databaseColumnStyle({}, "title")).toEqual({
      width: 240,
      minWidth: 240,
      maxWidth: 240
    });
    expect(databaseColumnStyle({ status: 312 }, "status")).toEqual({
      width: 312,
      minWidth: 312,
      maxWidth: 312
    });
    expect(databaseViewSource).toContain("data-database-column-resizer={property}");
    expect(databaseViewSource).toContain(
      '"relative border-b border-r border-border px-2 py-1.5"'
    );
  });

  it("reveals database records in batches of twenty", () => {
    const records = Array.from({ length: 45 }, (_, index) => `record-${index + 1}`);

    expect(DATABASE_RECORD_BATCH_SIZE).toBe(20);
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE)).toEqual(records.slice(0, 20));
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE * 2)).toEqual(records.slice(0, 40));
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE * 3)).toEqual(records);
  });

  it("keeps a newly created record visible while its name is being edited", () => {
    const records = Array.from({ length: 25 }, (_, index) => ({ path: `record-${index + 1}` }));

    expect(databaseRecordsForDisplay(
      records,
      DATABASE_RECORD_BATCH_SIZE,
      "record-25",
      (record) => record.path
    )).toEqual([records[24], ...records.slice(0, 19)]);
    expect(databaseRecordTitleFromPath("Projects/New Page.md")).toBe("New Page");
  });

  it("uses a plain wrapping record-name editor with the caret at the end", () => {
    expect(databaseViewSource).toContain('data-database-record-name-editor="true"');
    expect(databaseViewSource).toContain("input.setSelectionRange(input.value.length, input.value.length)");
    expect(databaseViewSource).toContain("useLayoutEffect(() =>");
    expect(databaseViewSource).toContain("border-0 bg-transparent");
    expect(DATABASE_RECORD_NAME_LAYOUT_CLASS).toContain("box-border block min-h-7");
    expect(DATABASE_RECORD_NAME_LAYOUT_CLASS).toContain("whitespace-pre-wrap");
    expect(DATABASE_RECORD_NAME_LAYOUT_CLASS).toContain("px-1 py-1 text-left leading-5");
    expect(databaseViewSource.match(/DATABASE_RECORD_NAME_LAYOUT_CLASS/gu)).toHaveLength(3);
    expect(databaseViewSource).toContain('<span className="block">{record.title}</span>');
    expect(databaseViewSource).not.toContain(
      '<span className="truncate">{record.title}</span>'
    );
  });

  it("wraps ordinary text values instead of using a one-line field", () => {
    expect(databaseViewSource).toContain('data-database-text-cell="true"');
    expect(databaseViewSource).toContain('wrap="soft"');
    expect(databaseViewSource).toContain("break-words whitespace-pre-wrap");
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

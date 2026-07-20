import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RumiApiClient } from "@rumi/api-client";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  DATABASE_RECORD_BATCH_SIZE,
  DatabaseView,
  databaseRecordMoveDestinations,
  databaseRecordsForDisplay
} from "./DatabaseView";

describe("database table presentation", () => {
  it("uses a borderless, unrestricted-height horizontal scroll frame without a manual refresh action", () => {
    const markup = renderToStaticMarkup(createElement(DatabaseView, {
      api: {} as RumiApiClient,
      databasePath: "Projects",
      refreshRevision: 0,
      onOpenRecord: () => undefined,
      onMessage: () => undefined
    }));
    const section = markup.match(/<section[^>]*aria-label="Database records"[^>]*>/u)?.[0] ?? "";
    const scrollFrame = markup.match(/<div[^>]*data-database-table-scroll="true"[^>]*>/u)?.[0] ?? "";
    const tableHeader = markup.match(/<thead[^>]*>/u)?.[0] ?? "";
    const selectionHeader = markup.match(/<th[^>]*data-database-selection-column="true"[^>]*>/u)?.[0] ?? "";

    expect(markup).not.toContain(">Refresh<");
    expect(section).toContain("w-full min-w-0 max-w-full");
    expect(section).not.toContain("border-y");
    expect(scrollFrame).not.toContain("max-h-");
    expect(scrollFrame).toContain("overflow-x-auto");
    expect(scrollFrame).not.toContain("rounded-md");
    expect(scrollFrame).not.toContain("border-border");
    expect(tableHeader).toContain("sticky top-0 z-10");
    expect(tableHeader).toContain("bg-muted");
    expect(selectionHeader).not.toContain("border-r");
    expect(markup).toContain('data-database-selection-column="true"');
    expect(markup).toContain('aria-label="Select all records"');
  });

  it("reveals database records in batches of twenty", () => {
    const records = Array.from({ length: 45 }, (_, index) => `record-${index + 1}`);

    expect(DATABASE_RECORD_BATCH_SIZE).toBe(20);
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE)).toEqual(records.slice(0, 20));
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE * 2)).toEqual(records.slice(0, 40));
    expect(databaseRecordsForDisplay(records, DATABASE_RECORD_BATCH_SIZE * 3)).toEqual(records);
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

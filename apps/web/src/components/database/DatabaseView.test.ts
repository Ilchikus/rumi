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
      variant: "embed",
      embedSourceControl: createElement(
        "span",
        { "data-database-source": "true" },
        "Projects"
      )
    }));
    const section = markup.match(/<section[^>]*aria-label="Database records"[^>]*>/u)?.[0] ?? "";
    const tableFrame = markup.match(/<div[^>]*data-database-table-frame="true"[^>]*>/u)?.[0] ?? "";
    const scrollFrame = markup.match(/<div[^>]*data-database-table-scroll="true"[^>]*>/u)?.[0] ?? "";
    const table = markup.match(/<table[^>]*>/u)?.[0] ?? "";
    const tableHeader = markup.match(/<thead[^>]*>/u)?.[0] ?? "";
    const selectionOverlay = markup.match(
      /<div[^>]*data-database-selection-overlay="true"[^>]*>/u
    )?.[0] ?? "";
    const toolbar = markup.match(/<div[^>]*data-database-toolbar="true"[^>]*>/u)?.[0] ?? "";

    expect(markup).not.toContain(">Refresh<");
    expect(markup).toContain('data-database-source="true"');
    expect(toolbar).toContain("h-12");
    expect(toolbar).toContain("mb-1.5");
    expect(toolbar).toContain("flex-nowrap items-center");
    expect(toolbar).toContain("py-1");
    expect(toolbar).not.toContain("top-px");
    expect(toolbar).not.toContain("bg-");
    expect(databaseViewSource).toContain(
      'className="ml-auto flex h-10 items-center gap-1.5"'
    );
    expect(databaseViewSource).toContain(
      'className="relative ml-auto h-10 shrink-0"'
    );
    expect(databaseViewSource).toContain(
      'className="relative z-10 flex h-10 items-center gap-1 bg-white"'
    );
    expect(databaseViewSource).toContain(
      "group/clear-selection mr-2 grid h-8 grid-cols-1 items-center"
    );
    expect(toolbar).toContain("items-center gap-2 py-1");
    expect(section).toContain("w-full min-w-0 max-w-full");
    expect(section).not.toContain("border-y");
    expect(scrollFrame).not.toContain("max-h-");
    expect(scrollFrame).toContain("overflow-x-auto");
    expect(scrollFrame).not.toContain("overflow-y-hidden");
    expect(scrollFrame).not.toContain("rounded-md");
    expect(scrollFrame).not.toContain("border-border");
    expect(tableFrame).toContain("relative w-full min-w-0 max-w-full");
    expect(scrollFrame).toContain("w-full min-w-0 max-w-full");
    expect(scrollFrame).not.toContain("-ml-8");
    expect(scrollFrame).not.toContain("pl-8");
    expect(table).toContain("w-max");
    expect(table).toContain("min-w-[max(100%,620px)]");
    expect(table).toContain("border-separate border-spacing-0");
    expect(table).not.toContain("border-collapse");
    expect(tableHeader).toContain("sticky top-0 z-10");
    expect(tableHeader).toContain("bg-white");
    expect(tableHeader).not.toContain("bg-neutral-100");
    expect(markup).not.toContain('data-database-header-outline="true"');
    expect(selectionOverlay).toContain(
      "pointer-events-none absolute inset-y-0 -left-7 z-30 w-7"
    );
    expect(markup).toContain("group/header relative border-y border-border px-2 py-1.5");
    expect(markup).toContain("w-60 min-w-60");
    expect(markup).toContain("w-12 min-w-12 max-w-12");
    expect(markup).not.toContain('data-database-selection-column="true"');
    expect(markup).toContain('data-database-selection-control="all"');
    expect(databaseViewSource).toContain('data-database-selection-control="record"');
    expect(markup).toContain('aria-label="Select all records"');
    expect(markup).toContain("accent-sky-600");
    expect(markup).toContain("h-3.5 w-3.5");
    expect(databaseViewSource).toContain("grid h-full w-5");
    expect(databaseViewSource).toContain(
      '"group/selection-target pointer-events-auto absolute left-0 w-7"'
    );
    expect(databaseViewSource).toContain("top: selectionControlPositions.header.top");
    expect(databaseViewSource).toContain("height: selectionControlPositions.header.height");
    expect(databaseViewSource).toContain("style={{ top: position.top, height: position.height }}");
    expect(databaseViewSource).not.toContain("transition-opacity");
    expect(databaseViewSource).not.toContain("shadow-sm ring-1 ring-neutral-200");
    expect(markup).toContain('aria-label="Search database"');
    expect(markup.indexOf('aria-label="Search database"')).toBeLessThan(
      markup.indexOf('data-database-source="true"')
    );
    expect(markup.indexOf('data-database-source="true"')).toBeLessThan(
      markup.indexOf(">New</button>")
    );
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
    expect(databaseViewSource).toContain("group-hover/header:after:bg-border");
    expect(databaseViewSource).toContain("after:inset-y-0");
    expect(databaseViewSource).toContain('data-rumi-area-selection-exclude="true"');
    expect(databaseViewSource).toContain("tableRecordRowRefs");
    expect(databaseViewSource).toContain("new ResizeObserver(measureSelectionControls)");
    expect(databaseViewSource).not.toContain("--database-scroll-x");
    expect(databaseViewSource).toContain("|| selectedRecordPaths.has(record.path)");
    expect(databaseViewSource).not.toContain("DatabaseViewPropertyVisibilityMenu");
    expect(databaseViewSource).toContain("Show property");
    expect(databaseViewSource).toContain("border-b border-border bg-white");
    expect(databaseViewSource).toContain('searchOpen ? "w-56" : "w-8"');
    expect(databaseViewSource).toContain("absolute bottom-0 right-0 z-50 h-10 w-56");
    expect(databaseViewSource).toContain(
      "bg-gradient-to-r from-white/0 via-white/50 via-[30%] to-white"
    );
    expect(databaseViewSource).toContain('data-database-toolbar-fade="true"');
    expect(databaseViewSource).toContain('data-database-search-surface="true"');
    expect(databaseViewSource).toContain('data-database-selection-surface="true"');
    expect(databaseViewSource).toContain(
      "absolute -left-[44px] top-0 h-10 w-[44px]"
    );
    expect(databaseViewSource.match(/<DatabaseToolbarFade \/>/gu)).toHaveLength(2);
    expect(databaseViewSource).toContain(
      "onClick={() => setSelectedRecordPaths(new Set())}"
    );
    expect(databaseViewSource).toContain('document.addEventListener("keydown", handleEscape)');
    expect(databaseViewSource).toContain(
      'document.removeEventListener("keydown", handleEscape)'
    );
    expect(databaseViewSource).toContain("cancelToolbarModes();");
    expect(databaseViewSource).toContain("setSearchOpen(false);");
    expect(databaseViewSource).toContain("setSelectedRecordPaths(new Set());");
    expect(databaseViewSource).toContain("group-hover/clear-selection:opacity-100");
    expect(databaseViewSource.match(
      /variant === "embed" \? embedSourceControl : null/gu
    )).toHaveLength(1);
    expect(databaseViewSource).not.toContain("transition-[width]");
    expect(databaseViewSource).not.toContain("w-64");
    expect(databaseViewSource).not.toContain("toolbarStart");
    expect(databaseViewSource).toContain('variant === "embed" ? embedSourceControl : null');
    expect(databaseViewSource).not.toContain("rounded-md border border-neutral-200 bg-white shadow-sm");
    expect(databaseViewSource).toContain(
      '"group/header relative border-y border-border px-2 py-1.5"'
    );
    expect(databaseViewSource).not.toContain('first && "rounded-bl-lg border-l"');
    expect(databaseViewSource).not.toContain("sticky right-0 z-20 w-12");
    expect(databaseViewSource).not.toContain(
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

  it("persists embedded view changes only after an explicit tab selection", () => {
    expect(databaseViewSource).not.toContain("onActiveViewChange?.(resolvedViewId)");
    expect(databaseViewSource).toContain("onActiveViewChange?.(viewId)");
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

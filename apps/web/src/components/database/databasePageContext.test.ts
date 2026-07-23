import { describe, expect, it } from "vitest";
import type { PageDocument } from "@rumi/contracts";
import { mergeRefreshedDatabaseContext } from "./databasePageContext";

function recordPage(overrides: Partial<PageDocument> = {}): PageDocument {
  return {
    path: "Tasks/Current.md",
    kind: "page",
    frontmatter: { status: "local draft" },
    markdownBody: "Local Markdown draft",
    contentHash: "content-v1",
    frontmatterHash: "frontmatter-v1",
    version: "page-v1",
    database: {
      databasePath: "Tasks",
      schemaVersion: "schema-v1",
      schema: {
        type: "database",
        properties: { status: { type: "text" } },
        unsupportedProperties: [],
        unsupportedViews: [],
        recordPage: { hiddenProperties: [] },
        views: [{ id: "all", name: "All", type: "table", columns: ["status"] }]
      }
    },
    ...overrides
  };
}

describe("open record database context", () => {
  it("refreshes only database-owned schema state and preserves local record drafts", () => {
    const current = recordPage();
    const refreshed = recordPage({
      frontmatter: { status: "disk value" },
      markdownBody: "Disk Markdown",
      database: {
        ...current.database!,
        schemaVersion: "schema-v2",
        schema: {
          ...current.database!.schema,
          recordPage: { hiddenProperties: ["status"] }
        }
      }
    });

    expect(mergeRefreshedDatabaseContext(current, refreshed)).toEqual({
      ...current,
      database: refreshed.database
    });
  });

  it("rejects a response for a different page", () => {
    expect(mergeRefreshedDatabaseContext(
      recordPage(),
      recordPage({ path: "Tasks/Other.md" })
    )).toBeNull();
  });
});

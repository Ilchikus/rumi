import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DatabaseFilterItem } from "@rumi/contracts";
import {
  databaseFilterOptionsForQuery,
  databaseFilterOperators,
  databaseFilterRuleForProperty,
  databaseFilterRuleComplete,
  databaseFilterRuleCount,
  databaseFilterTreeComplete
} from "./DatabaseFilterMenu";

const filterMenuSource = readFileSync(
  new URL("./DatabaseFilterMenu.tsx", import.meta.url),
  "utf8"
);

const properties = {
  titleText: { type: "text" as const },
  priority: { type: "number" as const },
  due: { type: "date" as const },
  approved: { type: "checkbox" as const },
  status: {
    type: "select" as const,
    options: [{ name: "doing", color: "blue" as const }, { name: "done", color: "teal" as const }]
  },
  tags: {
    type: "multi-select" as const,
    options: [{ name: "editor", color: "violet" as const }, { name: "urgent", color: "rose" as const }]
  }
};

describe("database filter builder rules", () => {
  it("aligns operators with property types", () => {
    expect(databaseFilterOperators(properties.titleText)).toEqual([
      "contains",
      "not-contains",
      "equals",
      "not-equals",
      "is-empty",
      "is-not-empty"
    ]);
    expect(databaseFilterOperators(properties.priority)).toContain("greater-than");
    expect(databaseFilterOperators(properties.due)).toContain("less-than");
    expect(databaseFilterOperators(properties.approved)).toEqual(["equals", "not-equals"]);
    expect(databaseFilterOperators(properties.status)).not.toContain("greater-than");
  });

  it("keeps incomplete rules out of persistence", () => {
    expect(databaseFilterRuleComplete(
      { property: "title", operator: "contains" },
      properties
    )).toBe(false);
    expect(databaseFilterRuleComplete(
      { property: "title", operator: "contains", value: "Dat" },
      properties
    )).toBe(true);
    expect(databaseFilterRuleComplete(
      { property: "priority", operator: "greater-than", value: "2" },
      properties
    )).toBe(false);
    expect(databaseFilterRuleComplete(
      { property: "priority", operator: "greater-than", value: 2 },
      properties
    )).toBe(true);
    expect(databaseFilterRuleComplete(
      { property: "tags", operator: "equals", value: "editor" },
      properties
    )).toBe(false);
    expect(databaseFilterRuleComplete(
      { property: "tags", operator: "equals", value: ["editor"] },
      properties
    )).toBe(true);
    expect(databaseFilterRuleComplete(
      { property: "tags", operator: "equals", value: ["missing"] },
      properties
    )).toBe(false);
    expect(databaseFilterRuleComplete(
      { property: "status", operator: "equals", value: "missing" },
      properties
    )).toBe(false);
    expect(databaseFilterRuleComplete(
      { property: "due", operator: "equals", value: "2026-02-30" },
      properties
    )).toBe(false);
    expect(databaseFilterRuleComplete(
      { property: "status", operator: "is-empty" },
      properties
    )).toBe(true);
  });

  it("validates and counts nested groups recursively", () => {
    const filters: DatabaseFilterItem[] = [
      { property: "status", operator: "not-equals", value: "done" },
      {
        filterMode: "or",
        filters: [
          { property: "priority", operator: "greater-than", value: 2 },
          { property: "due", operator: "less-than", value: "2026-08-01" }
        ]
      }
    ];

    expect(databaseFilterTreeComplete(filters, properties)).toBe(true);
    expect(databaseFilterRuleCount(filters)).toBe(3);
    expect(databaseFilterTreeComplete([
      ...filters,
      { filters: [], filterMode: "and" }
    ], properties)).toBe(false);
  });

  it("resets condition and value when the property changes", () => {
    expect(databaseFilterRuleForProperty("priority", properties)).toEqual({
      property: "priority",
      operator: "equals"
    });
    expect(databaseFilterRuleForProperty("status", properties)).toEqual({
      property: "status",
      operator: "contains"
    });
  });

  it("keeps edits local until the explicit Apply action", () => {
    expect(filterMenuSource).toContain('{saving ? "Applying…" : "Apply"}');
    expect(filterMenuSource).toContain("const saved = await onChange(draft, draftMode)");
    expect(filterMenuSource).toContain('setSaveError("Filters could not be applied.")');
    expect(filterMenuSource).toContain("finally");
    expect(filterMenuSource).not.toContain("void persist(nextFilters");
    expect(filterMenuSource).not.toContain("onBlur={onCommit}");
  });

  it("renders configured select and multi-select options with the shared database pills", () => {
    expect(databaseFilterOptionsForQuery(properties.status.options, "DO")).toEqual([
      { name: "doing", color: "blue" },
      { name: "done", color: "teal" }
    ]);
    expect(databaseFilterOptionsForQuery(properties.status.options, "ing")).toEqual([
      { name: "doing", color: "blue" }
    ]);
    expect(filterMenuSource).toContain("DatabaseOptionPill");
    expect(filterMenuSource).toContain("options={definition.options ?? []}");
    expect(filterMenuSource).toContain("option={optionForValue(item, options)}");
    expect(filterMenuSource).toContain("<DatabaseOptionPill option={option}");
  });
});

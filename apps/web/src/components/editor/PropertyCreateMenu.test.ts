import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PropertyCreateMenu,
  movePropertyTypeIndex,
  propertyCreateEnterAction,
  propertyCreateNameError,
  propertyTypeIndexForQuery
} from "./PropertyCreateMenu";

const propertyCreateMenuSource = readFileSync(
  new URL("./PropertyCreateMenu.tsx", import.meta.url),
  "utf8"
);

const types = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Select" },
  { value: "multi-select", label: "Multi-select" }
] as const;

describe("property create menu", () => {
  it("defaults to Text and type-ahead focuses Date without changing the name", () => {
    expect(propertyTypeIndexForQuery(types, "", 0)).toBe(0);
    expect(propertyTypeIndexForQuery(types, "Dat", 0)).toBe(2);
    expect(propertyTypeIndexForQuery(types, "ulti", 0)).toBe(5);
  });

  it("navigates the grid and uses a two-Enter creation flow", () => {
    expect(movePropertyTypeIndex(0, 1, types.length)).toBe(1);
    expect(movePropertyTypeIndex(0, -1, types.length)).toBe(5);
    expect(movePropertyTypeIndex(1, 3, types.length)).toBe(4);
    expect(propertyCreateEnterAction(false)).toBe("confirm-type");
    expect(propertyCreateEnterAction(true)).toBe("create");
  });

  it("rejects empty and case-insensitive duplicate names", () => {
    expect(propertyCreateNameError("  ", [])).toBe("Enter a property name.");
    expect(propertyCreateNameError("Status", ["status"])).toBe(
      "A property with this name already exists."
    );
    expect(propertyCreateNameError("Due", ["status"])).toBe("");
  });

  it("renders as an anchored trigger rather than an inline form", () => {
    const markup = renderToStaticMarkup(createElement(PropertyCreateMenu, {
      types,
      existingNames: ["status"],
      onCreate: async () => true,
      trigger: createElement("button", { type: "button" }, "Add property")
    }));
    expect(markup).toContain("Add property");
    expect(markup).not.toContain("New property type");
  });

  it("always releases its pending state when creation fails", () => {
    expect(propertyCreateMenuSource).toContain("try {");
    expect(propertyCreateMenuSource).toContain("} catch {");
    expect(propertyCreateMenuSource).toContain("} finally {");
    expect(propertyCreateMenuSource).toContain("setCreating(false);");
    expect(propertyCreateMenuSource).toContain('event.key === "Escape"');
    expect(propertyCreateMenuSource).toContain("setOpen(false);");
    expect(propertyCreateMenuSource).toContain("reset();");
  });
});

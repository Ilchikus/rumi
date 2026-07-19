import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  convertPagePropertyValue,
  createPagePropertyValue,
  PageProperties,
  pagePropertyKind,
  renameFrontmatterProperty
} from "./PageProperties";
import { formatPropertyValue, pageTitleFromPath } from "./pagePresentation";

describe("page editor presentation", () => {
  it("derives page titles from each canonical filename shape", () => {
    expect(pageTitleFromPath("Idea.md", "page")).toBe("Idea");
    expect(pageTitleFromPath("Projects/Projects.index.md", "folder")).toBe("Projects");
    expect(pageTitleFromPath("Tasks/Tasks.db.md", "database")).toBe("Tasks");
    expect(pageTitleFromPath("Notes/release.v2.md", "page")).toBe("release.v2");
  });

  it("formats common YAML property values for display", () => {
    expect(formatPropertyValue("ready")).toBe("ready");
    expect(formatPropertyValue(true)).toBe("true");
    expect(formatPropertyValue(["server", "editor"])).toBe("server, editor");
    expect(formatPropertyValue({ owner: "Rumi" })).toBe('{"owner":"Rumi"}');
    expect(formatPropertyValue(null)).toBe("Empty");
  });

  it("renders YAML frontmatter as semantic property rows", () => {
    const markup = renderToStaticMarkup(
      createElement(PageProperties, {
        frontmatter: {
          status: "ready",
          published: true,
          tags: ["server", "editor"]
        }
      })
    );

    expect(markup).toContain("<dl");
    expect(markup).toContain("<dt");
    expect(markup).toContain("status");
    expect(markup).toContain("ready");
    expect(markup).toContain("published");
    expect(markup).toContain("True");
    expect(markup).toContain("server");
    expect(markup).toContain("editor");
  });

  it("infers portable page-property controls from YAML value shapes", () => {
    expect(pagePropertyKind("ready")).toBe("text");
    expect(pagePropertyKind("2026-07-19")).toBe("date");
    expect(pagePropertyKind("2026-02-30")).toBe("text");
    expect(pagePropertyKind(12)).toBe("number");
    expect(pagePropertyKind(false)).toBe("checkbox");
    expect(pagePropertyKind(["server", "editor"])).toBe("list");
    expect(pagePropertyKind({ owner: "Rumi" })).toBe("json");
    expect(pagePropertyKind(null)).toBe("text");
  });

  it("creates and converts values without adding page-only schema metadata", () => {
    expect(createPagePropertyValue("date", "2026-07-19")).toBe("2026-07-19");
    expect(createPagePropertyValue("checkbox")).toBe(false);
    expect(createPagePropertyValue("list")).toEqual([]);
    expect(convertPagePropertyValue("42", "number")).toBe(42);
    expect(convertPagePropertyValue("server", "list")).toEqual(["server"]);
    expect(convertPagePropertyValue('["server","editor"]', "json")).toEqual(["server", "editor"]);
  });

  it("renames a frontmatter property in place without overwriting another property", () => {
    const frontmatter = { status: "ready", owner: "Rumi" };

    expect(renameFrontmatterProperty(frontmatter, "status", "state")).toEqual({
      state: "ready",
      owner: "Rumi"
    });
    expect(renameFrontmatterProperty(frontmatter, "status", "owner")).toBe(frontmatter);
    expect(renameFrontmatterProperty(frontmatter, "status", " ")).toBe(frontmatter);
  });

  it("offers property creation even when a page has no frontmatter", () => {
    const markup = renderToStaticMarkup(
      createElement(PageProperties, {
        frontmatter: {},
        onChange: () => undefined
      })
    );

    expect(markup).toContain("Properties");
    expect(markup).toContain("Add property");
  });

  it("renders type-aware controls for editable page properties", () => {
    const markup = renderToStaticMarkup(
      createElement(PageProperties, {
        frontmatter: {
          status: "ready",
          published: true,
          launched: "2026-07-19",
          tags: ["server", "editor"]
        },
        onChange: () => undefined
      })
    );

    expect(markup).toContain('aria-label="Property text"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('type="date"');
    expect(markup).toContain('aria-label="Add list item"');
    expect(markup).toContain('aria-label="Delete status"');
  });
});

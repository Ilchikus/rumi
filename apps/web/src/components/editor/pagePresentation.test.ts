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
import { emptyPageTitle, formatPropertyValue, pageTitleFromPath } from "./pagePresentation";
import { EditablePageTitle, splitEditableTitle } from "./EditablePageTitle";
import {
  databasePropertyOptionChoices,
  rankDatabasePropertyOptions
} from "./DatabaseOptionEditor";
import {
  DatabaseOptionPill,
  databaseOptionColor,
  randomDatabaseOptionColor
} from "./DatabaseOptionPill";

describe("page editor presentation", () => {
  it("derives page titles from each canonical filename shape", () => {
    expect(pageTitleFromPath("Idea.md", "page")).toBe("Idea");
    expect(pageTitleFromPath("Projects/Projects.index.md", "folder")).toBe("Projects");
    expect(pageTitleFromPath("docs.index.md", "folder")).toBe("docs");
    expect(pageTitleFromPath("Tasks/Tasks.db.md", "database")).toBe("Tasks");
    expect(pageTitleFromPath("Notes/release.v2.md", "page")).toBe("release.v2");
  });

  it("uses kind-specific names when an inline title is split at the beginning", () => {
    expect(emptyPageTitle("page")).toBe("New Page");
    expect(emptyPageTitle("folder")).toBe("New Folder");
    expect(emptyPageTitle("database")).toBe("New Database");
    expect(splitEditableTitle("My Personal Project", 0, "New Page")).toEqual({
      title: "New Page",
      leadingContent: "My Personal Project"
    });
  });

  it("splits inline titles into a filename and the first content block", () => {
    expect(splitEditableTitle("My Personal Project Little Big Server", 20, "New Page")).toEqual({
      title: "My Personal Project",
      leadingContent: "Little Big Server"
    });
    expect(splitEditableTitle("My Personal Project", "My Personal Project".length, "New Page")).toEqual({
      title: "My Personal Project",
      leadingContent: ""
    });
  });

  it("renders an editable filename title without focus decoration", () => {
    const markup = renderToStaticMarkup(
      createElement(EditablePageTitle, {
        title: "Idea",
        editable: true,
        onRename: async () => true
      })
    );

    expect(markup).toContain('aria-label="Rename page"');
    expect(markup).toContain("Idea");
    expect(markup).toContain("focus:outline-none");
    expect(markup).toContain("focus:ring-0");
    expect(markup).not.toContain(".md");
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
    expect(markup).toContain("Checked");
    expect(markup).not.toContain("True");
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

    expect(markup).not.toContain(">Properties<");
    expect(markup).toContain("Create new property");
  });

  it("renders calm property previews that toggle editing when clicked", () => {
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

    expect(markup).toContain('aria-label="Edit status"');
    expect(markup).toContain('aria-label="Toggle published"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("text-sky-600");
    expect(markup).toContain('aria-label="Edit launched"');
    expect(markup).toContain('aria-label="Edit tags"');
    expect(markup).toContain("right-click for property options");
    expect(markup).not.toContain('aria-label="Property text"');
    expect(markup).not.toContain('aria-label="Type for status"');
    expect(markup).not.toContain('aria-label="Delete status"');
  });

  it("uses database schema definitions for record properties, including empty fields", () => {
    const markup = renderToStaticMarkup(
      createElement(PageProperties, {
        frontmatter: { status: "doing" },
        database: {
          databasePath: "Tasks",
          schemaVersion: "schema-v1",
          schema: {
            type: "database",
            unsupportedProperties: [],
            unsupportedViews: [],
            recordPage: { hiddenProperties: [] },
            properties: {
              status: { type: "select", options: [{ name: "todo" }, { name: "doing" }] },
              areas: { type: "multi-select", options: [{ name: "editor" }] },
              approved: { type: "checkbox" }
            },
            views: [{
              id: "all",
              name: "All",
              type: "table",
              columns: ["status", "areas", "approved"]
            }]
          }
        },
        onChange: () => undefined,
        onCreateDatabaseProperty: async () => true
      })
    );

    expect(markup).toContain('aria-label="Edit status"');
    expect(markup).toContain('aria-label="Edit areas"');
    expect(markup).toContain('aria-label="Toggle approved"');
    expect(markup).toContain("Hide properties");
    expect(markup).toContain("Create new property");
  });

  it("keeps record-page visibility independent while preserving unknown frontmatter", () => {
    const markup = renderToStaticMarkup(
      createElement(PageProperties, {
        frontmatter: {
          status: "doing",
          notes: "Visible detail",
          external: "Preserved"
        },
        database: {
          databasePath: "Tasks",
          schemaVersion: "schema-v2",
          schema: {
            type: "database",
            unsupportedProperties: [],
            unsupportedViews: [],
            properties: {
              status: { type: "text" },
              notes: { type: "text" }
            },
            recordPage: { hiddenProperties: ["status"] },
            views: [{
              id: "compact",
              name: "Compact",
              type: "table",
              columns: ["status"]
            }]
          }
        },
        onChange: () => undefined,
        onCreateDatabaseProperty: async () => true,
        onSetDatabasePropertyVisibility: async () => true
      })
    );

    expect(markup).not.toContain(">status<");
    expect(markup).toContain("Visible detail");
    expect(markup).toContain("Preserved");
    expect(markup).toContain('aria-label="Record page properties"');
  });

  it("ranks exact, prefix, and substring option matches in that order", () => {
    const options = [
      { name: "frontend" },
      { name: "end" },
      { name: "backend" },
      { name: "ending" }
    ];

    expect(rankDatabasePropertyOptions(options, "end").map((option) => option.name)).toEqual([
      "end",
      "ending",
      "frontend",
      "backend"
    ]);
  });

  it("focuses the first match or option creation when nothing matches", () => {
    const options = [{ name: "todo" }, { name: "doing" }];

    expect(databasePropertyOptionChoices(options, "do", true)[0]).toEqual({
      type: "option",
      name: "doing"
    });
    expect(databasePropertyOptionChoices(options, "blocked", true)[0]).toEqual({ type: "create" });
    expect(databasePropertyOptionChoices([], "", true)[0]).toEqual({ type: "create" });
    expect(databasePropertyOptionChoices(options, "todo", true)).toEqual([
      { type: "option", name: "todo" }
    ]);
  });

  it("renders select options as palette pills with the requested Tailwind weights", () => {
    const markup = renderToStaticMarkup(
      createElement(DatabaseOptionPill, {
        option: { name: "Blocked", color: "rose" },
        onRemove: () => undefined
      })
    );

    expect(markup).toContain("bg-rose-100");
    expect(markup).toContain("border-rose-300");
    expect(markup).toContain("text-rose-600");
    expect(markup).toContain('data-option-color="rose"');
    expect(markup).toContain("cursor-default");
    expect(markup).toContain('aria-label="Remove Blocked"');
    expect(markup).not.toContain("cursor-context-menu");
    expect(databaseOptionColor("legacy-color")).toBe("neutral");
    expect(randomDatabaseOptionColor(() => 0)).toBe("neutral");
    expect(randomDatabaseOptionColor(() => 0.999)).toBe("fuchsia");
  });
});

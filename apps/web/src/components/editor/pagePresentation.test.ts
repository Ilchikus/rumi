import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageProperties } from "./PageProperties";
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
});

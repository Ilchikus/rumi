import { describe, expect, it } from "vitest";
import { rewriteMarkdownReferences } from "./reference-repair";

describe("Markdown reference repair", () => {
  it("repairs generated mentions, custom links, Wikilinks, YAML values, and HTML hrefs", () => {
    const source = `---
related: "[[Notes/Old]]"
---
[Old](Notes/Old.md)
[Custom label](Notes/Old.md#details)
[Encoded](Notes/Old%20copy.md)
[[Notes/Old|Preserved alias]]
<a href="Notes/Old.md">Open</a>`;

    const result = rewriteMarkdownReferences(source, "Notes/Old.md", "Notes/New.md");

    expect(result.referenceCount).toBe(5);
    expect(result.markdown).toContain('related: "[[Notes/New]]"');
    expect(result.markdown).toContain("[New](Notes/New.md)");
    expect(result.markdown).toContain("[Custom label](Notes/New.md#details)");
    expect(result.markdown).toContain("[[Notes/New|Preserved alias]]");
    expect(result.markdown).toContain('<a href="Notes/New.md">Open</a>');
    expect(result.markdown).toContain("[Encoded](Notes/Old%20copy.md)");
  });

  it("repairs folder descendants and renamed companion paths", () => {
    const source = [
      "[Folder](Projects)",
      "[Page](Projects/Idea.md)",
      "[Index](Projects/Projects.index.md)",
      "[Database](Projects/Projects.db.md)"
    ].join("\n");
    const result = rewriteMarkdownReferences(source, "Projects", "Archive");

    expect(result.markdown).toBe([
      "[Folder](Archive)",
      "[Page](Archive/Idea.md)",
      "[Index](Archive/Archive.index.md)",
      "[Database](Archive/Archive.db.md)"
    ].join("\n"));
  });

  it("repairs links relative to the document containing them", () => {
    const result = rewriteMarkdownReferences(
      "[Old](Old.md)\n[Old from parent](../Notes/Old.md)",
      "Notes/Old.md",
      "Archive/New.md",
      "Notes/Reference.md"
    );

    expect(result.markdown).toBe(
      "[New](../Archive/New.md)\n[Old from parent](../Archive/New.md)"
    );
  });

  it("encodes new destination spaces while keeping Wikilink titles readable", () => {
    const result = rewriteMarkdownReferences(
      "[Old](Old.md)\n[[Old]]\n<a href=\"Old.md\">Old</a>",
      "Old.md",
      "New (1).md"
    );

    expect(result.markdown).toBe(
      "[New (1)](New%20(1).md)\n[[New (1)]]\n<a href=\"New%20(1).md\">Old</a>"
    );
  });

  it("repairs an encoded folder companion link without replacing file paths with app slugs", () => {
    const result = rewriteMarkdownReferences(
      "[inner](test%20folder/inner/inner.index.md)",
      "test folder/inner",
      "test folder/Renamed Inner",
      "test folder/all-blocks-and-properties.md"
    );

    expect(result.markdown).toBe(
      "[Renamed Inner](test%20folder/Renamed%20Inner/Renamed%20Inner.index.md)"
    );
  });

  it("does not rewrite external links, custom labels, inline code, or fenced examples", () => {
    const source = [
      "[Old](https://example.com/Old.md)",
      "[A deliberate label](Old.md)",
      "`[Old](Old.md)`",
      "```md",
      "[Old](Old.md)",
      "```"
    ].join("\n");
    const result = rewriteMarkdownReferences(source, "Old.md", "New.md");

    expect(result.referenceCount).toBe(1);
    expect(result.markdown).toContain("[A deliberate label](New.md)");
    expect(result.markdown).toContain("[Old](https://example.com/Old.md)");
    expect(result.markdown).toContain("`[Old](Old.md)`");
    expect(result.markdown).toContain("```md\n[Old](Old.md)\n```");
  });
});

import { describe, expect, it } from "vitest";
import { parseLightMarkdown, serializeLightMarkdown } from "./lightProseMirrorMarkdown";

describe("light ProseMirror Markdown bridge", () => {
  it("roundtrips basic Markdown blocks and marks", () => {
    const source = [
      "# Heading",
      "",
      "Paragraph with **bold**, *emphasis*, and `code`.",
      "",
      "- One",
      "- Two",
      "",
      "> Quote",
      ""
    ].join("\n");

    const markdown = serializeLightMarkdown(parseLightMarkdown(source));

    expect(markdown).toContain("# Heading");
    expect(markdown).toContain("Paragraph with **bold**, *emphasis*, and `code`.");
    expect(markdown).toContain("- One");
    expect(markdown).toContain("- Two");
    expect(markdown).toContain("> Quote");
  });

  it("does not create executable links from unsafe Markdown URLs", () => {
    const document = parseLightMarkdown(
      "[unsafe](javascript:alert(1)) [also unsafe](data:text/html,boom) [safe](https://example.com)"
    );
    const linkTargets: string[] = [];

    document.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === "link" && typeof mark.attrs.href === "string") {
          linkTargets.push(mark.attrs.href);
        }
      }
    });

    expect(linkTargets).toEqual(["https://example.com"]);
  });

  it("keeps nested ordered lists numbered through serialization", () => {
    const source = [
      "1. First",
      "   1. Nested first",
      "   2. Nested second",
      "2. Second",
      ""
    ].join("\n");

    const markdown = serializeLightMarkdown(parseLightMarkdown(source));

    expect(markdown).toMatch(/1\. First/);
    expect(markdown).toMatch(/\s+1\. Nested first/);
    expect(markdown).toMatch(/\s+2\. Nested second/);
    expect(markdown).toMatch(/2\. Second/);
  });

  it("roundtrips task items without turning ordinary list items into tasks", () => {
    const source = ["- [ ] Todo", "- [x] Done", "- Ordinary", ""].join("\n");
    const document = parseLightMarkdown(source);
    const checkedValues: Array<boolean | null> = [];

    document.descendants((node) => {
      if (node.type.name === "list_item") {
        checkedValues.push(node.attrs.checked as boolean | null);
      }
    });

    expect(checkedValues).toEqual([false, true, null]);
    expect(serializeLightMarkdown(document)).toContain("- [ ] Todo");
    expect(serializeLightMarkdown(document)).toContain("- [x] Done");
    expect(serializeLightMarkdown(document)).toContain("- Ordinary");
  });

  it("roundtrips GFM tables and strikethrough", () => {
    const source = [
      "| Name | Status |",
      "| --- | --- |",
      "| Editor | ~~draft~~ |",
      ""
    ].join("\n");
    const markdown = serializeLightMarkdown(parseLightMarkdown(source));

    expect(markdown).toContain("| Name | Status |");
    expect(markdown).toContain("| Editor | ~~draft~~ |");
  });

  it("preserves Rumi underline and highlight syntax", () => {
    const source = "<u>underlined</u> and <mark>highlighted</mark>";
    const markdown = serializeLightMarkdown(parseLightMarkdown(source));

    expect(markdown).toContain("<u>underlined</u>");
    expect(markdown).toContain("<mark>highlighted</mark>");
  });

  it("preserves named highlight colors from the old editor syntax", () => {
    const document = parseLightMarkdown("==blue::important==");
    const text = document.firstChild?.firstChild;

    expect(text?.marks.find((mark) => mark.type.name === "highlight")?.attrs.color).toBe("blue");
    expect(serializeLightMarkdown(document)).toBe('<mark data-color="blue">important</mark>');
  });

  it("preserves fenced code language, images, links, dividers, and blank documents", () => {
    const source = [
      "```mermaid",
      "graph TD",
      "  A --> B",
      "```",
      "",
      "![Diagram](.assets/diagram.png)",
      "",
      "[Internal](Projects/Idea.md)",
      "",
      "---",
      ""
    ].join("\n");
    const markdown = serializeLightMarkdown(parseLightMarkdown(source));

    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("A --> B");
    expect(markdown).toContain("![Diagram](.assets/diagram.png)");
    expect(markdown).toContain("[Internal](Projects/Idea.md)");
    expect(markdown).toContain("---");
    expect(serializeLightMarkdown(parseLightMarkdown(""))).toBe("");
  });

  it("recognizes old Rumi bookmark, file embed, and database embed syntax as blocks", () => {
    const source = [
      "https://rumi.md/docs",
      "",
      "![[.assets/guide.pdf]]",
      "",
      "```db",
      "source: Projects.db.md",
      "view: board",
      "filter: status=open",
      "```",
      ""
    ].join("\n");
    const document = parseLightMarkdown(source);

    expect(Array.from({ length: document.childCount }, (_, index) => document.child(index).type.name)).toEqual([
      "bookmark",
      "file_embed",
      "database_embed"
    ]);
    const markdown = serializeLightMarkdown(document);
    expect(markdown).toContain("https://rumi.md/docs");
    expect(markdown).toContain("![[.assets/guide.pdf]]");
    expect(markdown).toContain("source: Projects.db.md");
    expect(markdown).toContain("view: board");
  });

  it("turns a standalone image into a selectable image block", () => {
    const document = parseLightMarkdown('![Map](.assets/map.png "Architecture")');

    expect(document.firstChild?.type.name).toBe("image_block");
    expect(document.firstChild?.attrs).toMatchObject({
      src: ".assets/map.png",
      alt: "Map",
      title: "Architecture"
    });
    expect(serializeLightMarkdown(document)).toBe('![Map](.assets/map.png "Architecture")');
  });
});

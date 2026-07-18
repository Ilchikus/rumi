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
});

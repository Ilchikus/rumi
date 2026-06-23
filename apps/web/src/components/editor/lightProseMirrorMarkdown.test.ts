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
});

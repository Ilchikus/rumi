import { describe, expect, it } from "vitest";
import { findHeadingSectionEnd } from "./editorNodeViews";
import { parseLightMarkdown } from "./lightProseMirrorMarkdown";

describe("collapsible heading sections", () => {
  it("includes subordinate headings and stops at the next peer", () => {
    const doc = parseLightMarkdown(
      ["## First", "", "Body", "", "### Child", "", "Nested", "", "## Second", "", "After"].join("\n")
    );
    const firstPos = 0;
    let secondPos = -1;

    doc.forEach((node, pos) => {
      if (node.type.name === "heading" && node.textContent === "Second") secondPos = pos;
    });

    expect(findHeadingSectionEnd(doc, firstPos, 2)).toBe(secondPos);
  });

  it("extends the final heading section to the end of the document", () => {
    const doc = parseLightMarkdown("# Last\n\nBody\n");
    expect(findHeadingSectionEnd(doc, 0, 1)).toBe(doc.content.size);
  });
});

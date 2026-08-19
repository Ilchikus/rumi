// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn()
}));

vi.mock("mermaid", () => ({
  default: mermaidMocks
}));

import { codeBlockNodeView, findHeadingSectionEnd } from "./editorNodeViews";
import { lightEditorSchema, parseLightMarkdown } from "./lightProseMirrorMarkdown";

beforeEach(() => {
  mermaidMocks.render.mockReset();
  mermaidMocks.render.mockRejectedValue(new Error("invalid diagram"));
});

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

describe("Mermaid code block preview", () => {
  it("suppresses Mermaid's document-level syntax error rendering", async () => {
    const node = lightEditorSchema.nodes.code_block!.create(
      { params: "mermaid" },
      lightEditorSchema.text("not valid Mermaid")
    );
    const nodeView = codeBlockNodeView(node, {} as never, () => undefined);

    await vi.waitFor(() => expect(mermaidMocks.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ suppressErrorRendering: true })
    ));
    await vi.waitFor(() => expect(nodeView.dom.textContent).toContain("Diagram error"));

    expect(document.body.textContent).not.toContain("Syntax error in text");
  });
});

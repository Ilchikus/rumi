import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorStyles = readFileSync(new URL("./migrated/editor.css", import.meta.url), "utf8");

describe("editor layout contracts", () => {
  it("keeps oversized tables inside a two-axis scrolling content-width wrapper", () => {
    const wrapperRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror > .tableWrapper"
    );

    expect(wrapperRule).toContain("width: 100%;");
    expect(wrapperRule).toContain("max-width: 100%;");
    expect(wrapperRule).toContain("max-height: min(60vh, 36rem);");
    expect(wrapperRule).toContain("overflow: auto;");
    expect(wrapperRule).toContain("overscroll-behavior: contain;");
  });

  it("uses Tailwind sky 600 for checked task boxes", () => {
    const nestedTaskRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror li.task-list-item input[type="checkbox"]'
    );
    const flatTaskRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror .task-item input[type="checkbox"]'
    );

    expect(nestedTaskRule).toContain("accent-color: #0284c7;");
    expect(flatTaskRule).toContain("accent-color: #0284c7;");
  });
});

function cssRule(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"));
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

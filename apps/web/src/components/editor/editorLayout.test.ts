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
});

function cssRule(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"));
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

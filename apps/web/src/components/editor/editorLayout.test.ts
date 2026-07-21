import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorStyles = readFileSync(new URL("./migrated/editor.css", import.meta.url), "utf8");
const mentionPlugin = readFileSync(
  new URL("./migrated/plugins/atMention.ts", import.meta.url),
  "utf8"
);

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

  it("uses sky 600 links and semibold typed mention links", () => {
    const linkRule = cssRule(editorStyles, ".prosemirror-editor .ProseMirror a");
    const mentionRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror a[data-mention="true"]'
    );

    expect(linkRule).toContain("color: #0284c7;");
    expect(linkRule).toContain("text-decoration: underline;");
    expect(mentionRule).toContain("font-weight: 600;");
    expect(editorStyles).toContain('a[data-mention-kind="folder"]');
    expect(editorStyles).toContain('a[data-mention-kind="database"]');
    expect(editorStyles).toContain('a[data-mention-kind="page"]');
  });

  it("keeps the mention picker on current colors and applies pointer selections", () => {
    const menuRule = cssRule(editorStyles, ".at-mention-menu");
    const selectedRule = cssRule(
      editorStyles,
      ".at-mention-item:hover,\n.at-mention-item.selected"
    );

    expect(menuRule).toContain("background: hsl(var(--background));");
    expect(menuRule).toContain("color: hsl(var(--foreground));");
    expect(menuRule).toContain("border: 1px solid hsl(var(--border));");
    expect(selectedRule).toContain("background: hsl(var(--accent));");
    expect(mentionPlugin).toContain('fileList.addEventListener("pointerdown"');
    expect(mentionPlugin).not.toContain('item.addEventListener("mousedown"');
  });
});

function cssRule(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"));
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

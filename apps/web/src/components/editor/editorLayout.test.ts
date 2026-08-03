import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorStyles = readFileSync(new URL("./migrated/editor.css", import.meta.url), "utf8");
const sharedStyles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const mentionPlugin = readFileSync(
  new URL("./migrated/plugins/atMention.ts", import.meta.url),
  "utf8"
);
const databaseEmbedNodeView = readFileSync(
  new URL("./migrated/plugins/databaseEmbedNodeView.tsx", import.meta.url),
  "utf8"
);
const blockDragHandle = readFileSync(
  new URL("./migrated/plugins/blockDragHandle.ts", import.meta.url),
  "utf8"
);
const slashCommands = readFileSync(
  new URL("./migrated/plugins/slashCommands.ts", import.meta.url),
  "utf8"
);
const codeBlockView = readFileSync(
  new URL("./migrated/plugins/codeBlockView.ts", import.meta.url),
  "utf8"
);
const codeLanguagePicker = readFileSync(
  new URL("./migrated/plugins/CodeLanguagePicker.tsx", import.meta.url),
  "utf8"
);
const migratedEditor = readFileSync(
  new URL("./migrated/ProseMirrorEditor.tsx", import.meta.url),
  "utf8"
);

describe("editor layout contracts", () => {
  it("keeps Markdown tables in normal page scroll flow", () => {
    const wrapperRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror > .tableWrapper"
    );
    const sharedWrapperRule = cssRule(
      sharedStyles,
      ".rumi-prosemirror .tableWrapper"
    );

    expect(wrapperRule).toContain("width: 100%;");
    expect(wrapperRule).toContain("max-width: 100%;");
    expect(wrapperRule).toContain("overflow: visible;");
    expect(wrapperRule).not.toContain("max-height:");
    expect(wrapperRule).not.toContain("overscroll-behavior:");
    expect(sharedWrapperRule).toContain("overflow: visible;");
  });

  it("uses the standard blue block highlight for table selection", () => {
    const cellRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror .selectedCell"
    );
    const cellOverlayRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror .selectedCell::after"
    );
    const sharedCellOverlayRule = cssRule(
      sharedStyles,
      ".rumi-prosemirror .selectedCell::after"
    );

    expect(cellRule).toContain("background: hsl(213, 94%, 95%);");
    expect(cellOverlayRule).toContain("background: hsl(213, 94%, 95%);");
    expect(sharedCellOverlayRule).toContain("background: hsl(213, 94%, 95%);");
    expect(editorStyles).toContain(
      ".tableWrapper.ProseMirror-selectednode > table th"
    );
    expect(editorStyles).toContain(
      ".tableWrapper.multi-block-selected > table th"
    );
  });

  it("keeps selection quiet and table controls inactive until explicit gestures", () => {
    const areaSelectionEnd = blockDragHandle.slice(
      blockDragHandle.indexOf("private onAreaSelectEnd"),
      blockDragHandle.indexOf("private onWrapperClick")
    );

    expect(blockDragHandle).not.toContain("shouldOpenBlockContextMenuForSelection");
    expect(areaSelectionEnd).not.toContain("openContextMenuForSelectedBlocks");
    expect(migratedEditor).not.toContain("tableControlsPlugin");
    expect(migratedEditor).toContain("columnResizing()");
    expect(migratedEditor).toContain("tableEditing()");
  });

  it("constrains embedded database views to editor width before their table scrolls", () => {
    const embedRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror > .database-embed-block"
    );

    expect(embedRule).toContain("width: 100%;");
    expect(embedRule).toContain("min-width: 0;");
    expect(embedRule).toContain("max-width: 100%;");
    expect(databaseEmbedNodeView).toContain(
      "database-embed-block my-2 w-full min-w-0 max-w-full"
    );
    expect(databaseEmbedNodeView).toContain('aria-label="Database source"');
    expect(databaseEmbedNodeView).toContain("DropdownMenuContent");
    expect(databaseEmbedNodeView).toContain('data-database-embed-source="true"');
    expect(databaseEmbedNodeView).toContain('aria-label="Change database source"');
    expect(databaseEmbedNodeView).not.toContain("<select");
    expect(databaseEmbedNodeView).toContain(
      "onMessage={platform.onMessage ?? ignoreDatabaseMessage}"
    );
    expect(databaseEmbedNodeView).toContain('variant="embed"');
    expect(databaseEmbedNodeView).toContain("embedSourceControl={(");
    expect(databaseEmbedNodeView).not.toContain("toolbarStart");
    expect(databaseEmbedNodeView).toContain("documents={platform.documents}");
    expect(slashCommands).toContain("selectingSource: true");
  });

  it("clears block highlight after outside controls finish their click behavior", () => {
    expect(blockDragHandle).toContain('document.addEventListener("click", this.onDocClick)');
    expect(blockDragHandle).toContain("this.clearBlockSelection()");
    expect(blockDragHandle).toContain("if (!hasSelectedBlocks) return");
    expect(blockDragHandle).toContain(
      "if (this.view.state.selection instanceof NodeSelection)"
    );
    expect(blockDragHandle).toContain(
      'document.removeEventListener("click", this.onDocClick)'
    );
  });

  it("does not apply Markdown table layout and borders to embedded databases", () => {
    const markdownTableRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror > table,\n.prosemirror-editor .ProseMirror > .tableWrapper > table"
    );

    expect(markdownTableRule).toContain("table-layout: fixed;");
    expect(editorStyles).not.toMatch(/\.prosemirror-editor \.ProseMirror table\s*\{/u);
    expect(editorStyles).not.toMatch(/\.prosemirror-editor \.ProseMirror th\s*,/u);
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

  it("uses a searchable styled menu for code languages instead of a native select", () => {
    expect(codeBlockView).toContain("CodeLanguagePicker");
    expect(codeBlockView).not.toContain('document.createElement("select")');
    expect(codeLanguagePicker).toContain("DropdownMenuContent");
    expect(codeLanguagePicker).toContain('aria-label="Search code languages"');
    expect(codeLanguagePicker).not.toContain("<select");
  });

  it("updates live editor assistance settings without remounting", () => {
    expect(migratedEditor).toContain("highlightMisspellings = false");
    expect(migratedEditor).toContain("inlineReplacements = true");
    expect(migratedEditor).toContain("emojiSuggestions = true");
    expect(migratedEditor).toContain(
      'spellcheck: highlightMisspellings ? "true" : "false"'
    );
    expect(migratedEditor).toContain('viewRef.current?.dom.setAttribute(');
    expect(migratedEditor).toContain('[highlightMisspellings]');
    expect(migratedEditor).toContain("setInlineReplacementsEnabled(view, inlineReplacements)");
    expect(migratedEditor).toContain("setEmojiSuggestionsEnabled(view, emojiSuggestions)");
  });
});

function cssRule(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"));
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

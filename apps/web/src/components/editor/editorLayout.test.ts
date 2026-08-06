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
const mermaidNodeView = readFileSync(
  new URL("./migrated/plugins/mermaidNodeView.ts", import.meta.url),
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
const editorSchema = readFileSync(
  new URL("./migrated/schema.ts", import.meta.url),
  "utf8"
);
const selectionToolbar = readFileSync(
  new URL("./migrated/plugins/selectionToolbar.ts", import.meta.url),
  "utf8"
);

describe("editor layout contracts", () => {
  it("uses Tailwind neutral-100 code surfaces and a borderless Mermaid overlay switcher", () => {
    const codeBlockRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror pre"
    );
    const mermaidBlockRule = cssRule(editorStyles, ".mermaid-block-wrapper");
    const mermaidToolbarRule = cssRule(editorStyles, ".mermaid-toolbar");
    const mermaidViewToolbarRule = cssRule(
      editorStyles,
      '.mermaid-block-wrapper[data-mode="view"] .mermaid-toolbar'
    );
    const mermaidEditorRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror pre.mermaid-editor"
    );

    expect(codeBlockView).toContain(
      'this.dom.classList.add("code-block-wrapper", "bg-neutral-100")'
    );
    expect(mermaidNodeView).toContain(
      'this.dom.classList.toggle("bg-neutral-100", !isView)'
    );
    expect(codeBlockRule).not.toContain("background");
    expect(mermaidBlockRule).not.toContain("border:");
    expect(mermaidBlockRule).not.toContain("background");
    expect(mermaidToolbarRule).toContain("position: absolute;");
    expect(mermaidToolbarRule).toContain("top: 8px;");
    expect(mermaidToolbarRule).toContain("right: 8px;");
    expect(mermaidViewToolbarRule).toContain("opacity: 0;");
    expect(mermaidViewToolbarRule).toContain("pointer-events: none;");
    expect(editorStyles).toContain(
      '.mermaid-block-wrapper[data-mode="view"]:hover .mermaid-toolbar'
    );
    expect(mermaidEditorRule).toContain("overflow: hidden;");
  });

  it("uses flush five-pixel paragraph spacing and tighter flush list spacing", () => {
    const paragraphRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror > p"
    );
    const flatListRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror .bullet-item,\n.prosemirror-editor .ProseMirror .numbered-item,\n.prosemirror-editor .ProseMirror .task-item"
    );

    expect(paragraphRule).toContain("margin: 5px 0;");
    expect(paragraphRule).toContain("padding-left: 0;");
    expect(flatListRule).toContain("margin: 2px 0;");
    expect(flatListRule).toContain("padding-left: 0;");
    expect(editorStyles).not.toContain(".prosemirror-editor .ProseMirror > p:last-child");
  });

  it("uses shared muted list decorations, aligned checklist controls, and indent guides", () => {
    const flatListRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror .bullet-item,\n.prosemirror-editor .ProseMirror .numbered-item,\n.prosemirror-editor .ProseMirror .task-item"
    );
    const decorationRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror .list-decoration"
    );
    const numberedDecorationRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror .numbered-item .list-decoration::before"
    );
    const bulletDecorationRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror .bullet-item .bullet-decoration::before"
    );
    const checkboxRule = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror .task-item .task-checkbox"
    );
    const checkboxInputRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror .task-item input[type="checkbox"]'
    );
    const indentGuideRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror :is(.bullet-item, .numbered-item, .task-item)[data-indent]:not([data-indent="0"])::after'
    );
    const counterRestartRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror > :not(.numbered-item) + .numbered-item[data-indent="0"]'
    );

    expect(flatListRule).toContain("--rumi-list-decoration-width: 1.25em;");
    expect(flatListRule).toContain("--rumi-list-decoration-gap: 0.5em;");
    expect(flatListRule).toContain("--rumi-list-guide-x: 0.625em;");
    expect(flatListRule).toContain("display: flex;");
    expect(flatListRule).toContain("gap: var(--rumi-list-decoration-gap);");
    expect(decorationRule).toContain("width: var(--rumi-list-decoration-width);");
    expect(decorationRule).toContain("flex: 0 0 var(--rumi-list-decoration-width);");
    expect(decorationRule).toContain("color: #d4d4d4;");
    expect(bulletDecorationRule).toContain("font-size: 2em;");
    expect(bulletDecorationRule).toContain("line-height: 0.8;");
    expect(numberedDecorationRule).toContain("font-variant-numeric: tabular-nums;");
    expect(numberedDecorationRule).toContain("text-align: left;");
    expect(checkboxRule).toContain("margin-top: 2px;");
    expect(checkboxInputRule).toContain("appearance: none;");
    expect(checkboxInputRule).toContain("border: 1px solid #d4d4d4;");
    expect(indentGuideRule).toContain("width: var(--rumi-list-indent-offset);");
    expect(indentGuideRule).toContain("background-size: 1.5em 100%;");
    expect(indentGuideRule).toContain("#f5f5f5");
    expect(indentGuideRule).toContain("var(--rumi-list-guide-x)");
    expect(counterRestartRule).toContain("counter-set: numbered-item-0 1;");
    expect(counterRestartRule).not.toContain("counter-reset:");
    expect(editorSchema).toContain('class: "list-decoration bullet-decoration"');
    expect(editorSchema).toContain('class: "list-decoration numbered-decoration"');
    expect(editorSchema).toContain('class: "list-item-content"');
  });

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

  it("uses neutral unchecked task boxes and the original blue checked state", () => {
    const nestedTaskRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror li.task-list-item input[type="checkbox"]'
    );
    const flatTaskRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror .task-item input[type="checkbox"]'
    );
    const checkedTaskRule = cssRule(
      editorStyles,
      '.prosemirror-editor .ProseMirror li.task-list-item input[type="checkbox"]:checked,\n.prosemirror-editor .ProseMirror .task-item input[type="checkbox"]:checked'
    );

    expect(nestedTaskRule).toContain("border: 1px solid #d4d4d4;");
    expect(flatTaskRule).toContain("border: 1px solid #d4d4d4;");
    expect(checkedTaskRule).toContain("border-color: #0284c7;");
    expect(checkedTaskRule).toContain("background-color: #0284c7;");
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

  it("supports floating, expanded top and bottom, and hidden editor toolbar modes", () => {
    const floatingRule = cssRule(
      editorStyles,
      '.selection-toolbar[data-mode="floating"]'
    );
    const expandedRule = cssRule(
      editorStyles,
      '.selection-toolbar:is([data-mode="top"], [data-mode="bottom"])'
    );
    const topRule = cssRule(
      editorStyles,
      '.selection-toolbar[data-mode="top"]'
    );
    const bottomRule = cssRule(
      editorStyles,
      '.selection-toolbar[data-mode="bottom"]'
    );

    expect(floatingRule).toContain("position: absolute;");
    expect(expandedRule).toContain("position: fixed;");
    expect(expandedRule).toContain("width: min(900px, calc(100vw - 32px));");
    expect(expandedRule).toContain("transform: translateX(-50%);");
    expect(expandedRule).toContain("justify-content: space-between;");
    expect(expandedRule).toContain("flex-wrap: nowrap;");
    expect(expandedRule).toContain("overflow: visible;");
    expect(expandedRule).toContain("border: 1px solid hsl(var(--border));");
    expect(expandedRule).toContain("border-radius: 8px;");
    expect(expandedRule).toContain("box-shadow:");
    expect(topRule).toContain(
      "top: calc(var(--rumi-editor-toolbar-top, 20px) + env(safe-area-inset-top));"
    );
    expect(topRule).not.toContain("bottom:");
    expect(bottomRule).toContain("bottom: calc(20px + env(safe-area-inset-bottom));");
    expect(bottomRule).not.toContain("top:");
    expect(editorStyles).toContain(".selection-toolbar-block-group,");
    expect(editorStyles).toContain(".selection-toolbar-inline-group {");
    expect(editorStyles).toContain(".selection-toolbar-history-group,");
    expect(editorStyles).toContain(".selection-toolbar-delete-group {");
    expect(editorStyles).toContain(".editor-toolbar-delete-button:hover:not(:disabled)");
    expect(editorStyles).toContain("color: #e11d48;");
    expect(editorStyles).toContain("border-left: 1px solid hsl(var(--border));");
    expect(selectionToolbar).toContain('mode === "none"');
    expect(selectionToolbar).toContain("isExpandedEditorToolbarMode(mode)");
    expect(selectionToolbar).toContain('closest<HTMLElement>("[data-rumi-editor-canvas]")');
    expect(selectionToolbar).toContain("selectedBlockInlineRanges(state)");
    expect(selectionToolbar).toContain("EDITOR_TOOLBAR_BLOCK_TYPE_OPTIONS.forEach");
    expect(selectionToolbar).toContain('["mermaid", "table", "horizontal_rule"]');
    expect(selectionToolbar).toContain('"Upload media"');
    expect(selectionToolbar).toContain('"Delete block"');
    expect(selectionToolbar).toContain('"Undo (⌘Z)"');
    expect(selectionToolbar).toContain('"Redo (⇧⌘Z)"');
    expect(selectionToolbar).toContain('"Add before (⇧⌘↵)"');
    expect(selectionToolbar).toContain('"Add after (⌘↵)"');
    expect(editorStyles).toContain(".rumi-structural-caret-before");
    expect(editorStyles).toContain(".rumi-structural-caret-after");
    const databaseCaretBefore = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror-focused > .database-embed-block.rumi-structural-caret-before::before"
    );
    const databaseCaretAfter = cssRule(
      editorStyles,
      ".prosemirror-editor .ProseMirror-focused > .database-embed-block.rumi-structural-caret-after::before"
    );
    expect(databaseCaretBefore).toContain("top: 0;");
    expect(databaseCaretBefore).toContain("left: 0;");
    expect(databaseCaretBefore).toContain("transform: none;");
    expect(databaseCaretAfter).toContain("top: auto;");
    expect(databaseCaretAfter).toContain("right: 0;");
    expect(databaseCaretAfter).toContain("bottom: 0;");
    expect(migratedEditor).toContain("setSelectionToolbarPreferences(view");
  });

  it("uses modifier-aware link text and a Phosphor external-link affordance", () => {
    expect(editorStyles).toContain(".prosemirror-editor.rumi-command-link-mode .ProseMirror a:hover");
    expect(editorStyles).toContain('a[data-external-link="true"]::after');
    expect(editorStyles).toContain("cursor: text;");
    expect(editorStyles).toContain("cursor: pointer;");
    expect(editorStyles).toContain("M224,104a8,8");
  });
});

function cssRule(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"));
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

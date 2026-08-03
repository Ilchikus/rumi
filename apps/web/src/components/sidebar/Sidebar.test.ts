import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const editableTitleSource = readFileSync(
  new URL("../editor/EditablePageTitle.tsx", import.meta.url),
  "utf8"
);

describe("sidebar create-menu shortcuts", () => {
  it("keeps the root create menu controlled by the browser shell", () => {
    expect(sidebarSource).toContain("<DropdownMenu open={open} onOpenChange={onOpenChange}>");
    expect(appSource).toContain('action === "open-create-menu"');
    expect(appSource).toContain("setRootCreateMenuOpen(true)");
  });

  it("supports numbered focus and primary-modifier immediate creation", () => {
    expect(sidebarSource).toContain("createMenuIndexForKey(event)");
    expect(sidebarSource).toContain("itemRefs.current[index]?.focus()");
    expect(sidebarSource).toContain('event.key !== "Enter" || !hasPrimaryModifier(event, platform)');
    expect(sidebarSource).toContain("immediatePointerKindRef.current === option.kind");
  });

  it("opens default-named items with their complete title selected", () => {
    expect(appSource).toContain("const defaultName = emptyPageTitle(kind)");
    expect(appSource).toContain("selectAll: true");
    expect(editableTitleSource).toContain("selectTextContents(editableTitle)");
    expect(editableTitleSource).toContain("range.selectNodeContents(root)");
  });

  it("keeps inline create and rename input spaces during typing", () => {
    expect(sidebarSource.match(
      /onChange=\{\(event\) => setName\(sanitizeWorkspaceName\(event\.target\.value\)\.sanitized\)\}/g
    )).toHaveLength(2);
    expect(sidebarSource).toContain(
      "const finalName = sanitizeWorkspaceName(name).sanitized.trim();"
    );
  });
});

describe("sidebar settings entry", () => {
  it("places a Phosphor Gear settings action above Trash", () => {
    expect(sidebarSource).toContain(
      'import { Gear } from "@phosphor-icons/react/dist/csr/Gear"'
    );
    expect(sidebarSource).toContain("onOpenSettings");
    expect(sidebarSource.indexOf(">Settings</span>")).toBeLessThan(
      sidebarSource.indexOf(">Trash</span>")
    );
  });

  it("keeps the sidebar free of top and bottom horizontal rules", () => {
    expect(sidebarSource).toContain(
      '<header className="relative z-30 bg-neutral-50 px-3 pb-5 pt-3">'
    );
    expect(sidebarSource).toContain('<footer className="space-y-0.5 p-2">');
    expect(sidebarSource).not.toContain('<header className="border-b');
    expect(sidebarSource).not.toContain('<footer className="border-t');
  });
});

describe("sidebar active ancestor trail", () => {
  it("uses a CSS sticky scope ending at the active item", () => {
    expect(sidebarSource).toContain("const stickyAncestorIndexes = useMemo(");
    expect(sidebarSource).toContain("const paths = selection ? ancestorPaths(selection.nodePath) : []");
    expect(sidebarSource).toContain("paths.some((path) => !expandedPaths.has(path))");
    expect(sidebarSource).toContain("flattenVisibleTreeRows(");
    expect(sidebarSource).toContain(
      "visibleTreeRows.slice(stickyScopeStartIndex, activeRowIndex)"
    );
    expect(sidebarSource).toContain('className="grid"');
    expect(sidebarSource).toContain("gridTemplateRows:");
    expect(sidebarSource).toContain("const stickyFootprintRows = isActiveAncestor");
    expect(sidebarSource).toContain('className="pointer-events-none sticky self-stretch"');
    expect(sidebarSource).toContain(
      "gridRow: `${gridRow} / span ${stickyFootprintRows}`"
    );
    expect(sidebarSource).toContain('data-sidebar-sticky-ancestor={isActiveAncestor ? "true" : undefined}');
    expect(sidebarSource).toContain("selection?.nodePath === node.path ? \"true\" : undefined");
    expect(sidebarSource).toContain("zIndex: Math.max(1, 20 - stickyAncestorIndex)");
    expect(sidebarSource).toContain("paddingLeft: TREE_ROW_PADDING_PX + depth * TREE_INDENT_PX");
    expect(sidebarSource).toContain("<TreeDepthGuides");
    expect(sidebarSource).toContain(
      'className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain"'
    );
    expect(sidebarSource).not.toContain("stickyReleaseFrameRef");
    expect(sidebarSource).not.toContain("activeRow.getBoundingClientRect()");
    expect(sidebarSource).not.toContain("--rumi-sidebar-sticky-release");
    expect(sidebarSource).not.toContain("onScroll=");
    expect(sidebarSource).not.toContain("TREE_SCROLL_PADDING_PX");
  });

  it("keeps the complete active branch guide highlighted", () => {
    expect(sidebarSource).toContain("const rowAncestorPaths = ancestorPaths(nodePath)");
    expect(sidebarSource).toContain(
      'stickyAncestorIndexes.has(rowAncestorPaths[index] ?? "")'
    );
    expect(sidebarSource).not.toContain('active ? "bg-primary/70" : "bg-border"');
  });

  it("uses solid neutral surfaces for the sidebar and active item", () => {
    expect(sidebarSource).toContain("border-border bg-neutral-50 text-foreground");
    expect(sidebarSource).toContain('isSelected && "bg-neutral-100 text-accent-foreground"');
    expect(sidebarSource).not.toContain("bg-muted/35");
    expect(sidebarSource).not.toContain("bg-muted/95");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  shouldCreatePageImmediately,
  sidebarCreationParentPath,
  sidebarNodeCreateKinds
} from "./Sidebar";
import type { WorkspaceNode } from "@rumi/contracts";

const sidebarSource = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const workspaceItemMenuSource = readFileSync(
  new URL("../workspace/WorkspaceItemMenu.tsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const publicLogoSource = readFileSync(
  new URL("../../../public/rumi-logo.svg", import.meta.url),
  "utf8"
);
const suppliedLogoSource = readFileSync(
  new URL("../../../../../docs/.assets/light.svg", import.meta.url),
  "utf8"
);
const editableTitleSource = readFileSync(
  new URL("../editor/EditablePageTitle.tsx", import.meta.url),
  "utf8"
);

describe("Rumi logo", () => {
  it("uses the latest supplied vector in the sidebar and favicon", () => {
    expect(publicLogoSource).toBe(suppliedLogoSource);
    expect(publicLogoSource).toContain('width="728" height="691"');
    expect(sidebarSource).toContain('/rumi-logo.svg?v=20260819-1');
    expect(indexSource).toContain('/rumi-logo.svg?v=20260819-1');
  });
});

describe("sidebar create-menu shortcuts", () => {
  const nestedTree: WorkspaceNode = {
    path: "",
    name: "notes",
    kind: "workspace",
    children: [{
      path: "personal",
      name: "personal",
      kind: "folder",
      children: [{
        path: "personal/tasks",
        name: "tasks",
        kind: "folder",
        children: [{
          path: "personal/tasks/groceries.md",
          name: "groceries.md",
          kind: "page"
        }]
      }]
    }, {
      path: "Milestones",
      name: "Milestones",
      kind: "database",
      children: [{
        path: "Milestones/Launch.md",
        name: "Launch.md",
        kind: "page"
      }]
    }]
  };

  it("offers three child types for folders and only pages for databases", () => {
    expect(sidebarNodeCreateKinds("folder")).toEqual(["page", "folder", "database"]);
    expect(sidebarNodeCreateKinds("database")).toEqual(["page"]);
    expect(sidebarNodeCreateKinds("page")).toEqual([]);
  });

  it("keeps the root create menu controlled by the browser shell", () => {
    expect(sidebarSource).toContain("<DropdownMenu open={open} onOpenChange={onOpenChange}>");
    expect(appSource).toContain('action === "open-create-menu"');
    expect(appSource).toContain("setRootCreateMenuOpen(true)");
  });

  it("creates and opens the focused type when its number is repeated", () => {
    expect(sidebarSource).toContain("createMenuNumberAction(");
    expect(sidebarSource).toContain("numberedSelectionRef.current = numberAction.index");
    expect(sidebarSource).toContain("itemRefs.current[numberAction.index]?.focus()");
    expect(sidebarSource).toContain("createImmediately(option.kind)");
    expect(sidebarSource).toContain('event.key !== "Enter" || !hasPrimaryModifier(event, platform)');
    expect(sidebarSource).toContain("immediatePointerKindRef.current === option.kind");
  });

  it("creates in the nearest folder or database around the current page", () => {
    expect(sidebarCreationParentPath(nestedTree, {
      nodePath: "personal/tasks/groceries.md",
      openPath: "personal/tasks/groceries.md",
      kind: "page"
    })).toBe("personal/tasks");
    expect(sidebarCreationParentPath(nestedTree, {
      nodePath: "Milestones/Launch.md",
      openPath: "Milestones/Launch.md",
      kind: "page"
    })).toBe("Milestones");
    expect(sidebarCreationParentPath(nestedTree, {
      nodePath: "personal",
      openPath: "personal/personal.index.md",
      kind: "folder"
    })).toBe("personal");
    expect(sidebarCreationParentPath(nestedTree, {
      nodePath: "groceries.md",
      openPath: "groceries.md",
      kind: "page"
    })).toBe("");
  });

  it("passes the contextual parent to named and immediate root-menu creation", () => {
    expect(appSource).toContain("sidebarCreationParentPath(tree, selection)");
    expect(appSource).toContain("parentPath={creationParentPath}");
    expect(sidebarSource).toContain("onCreate(parentPath, option.kind)");
    expect(sidebarSource).toContain("onCreateDefault(parentPath, kind)");
  });

  it("opens modified New Page actions from folder and database menus immediately", () => {
    const commandClick = {
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false
    };

    expect(shouldCreatePageImmediately("page", commandClick, "mac")).toBe(true);
    expect(shouldCreatePageImmediately("folder", commandClick, "mac")).toBe(false);
    expect(shouldCreatePageImmediately("database", commandClick, "mac")).toBe(false);
    expect(workspaceItemMenuSource).toContain("void onCreateDefault(node.path, createKind)");
    expect(sidebarSource).toContain("onCreateDefault={onCreateDefault}");
    expect(sidebarSource).toContain(
      "updateExpandedPaths((current) => new Set(current).add(parentPath))"
    );
    expect(appSource).toContain(
      "refreshAfterMutation(\n        result.path,\n        selectTitleAfterCreate"
    );
    expect(appSource).toContain("insertPageIntoSidebar(result.path)");
    expect(appSource).toContain("window.setTimeout(() => {");
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
    )).toHaveLength(3);
    expect(sidebarSource).toContain(
      "const finalName = sanitizeWorkspaceName(name).sanitized.trim();"
    );
  });
});

describe("sidebar context-menu keyboard focus", () => {
  it("wires explicit open focus and close restoration into sidebar menus", () => {
    expect(workspaceItemMenuSource).toContain(
      "if (contentRef.current) focusFirstWorkspaceItemMenuAction(contentRef.current)"
    );
    expect(workspaceItemMenuSource).toContain('event.key !== "ArrowDown" && event.key !== "ArrowUp"');
    expect(workspaceItemMenuSource).toContain("moveWorkspaceItemMenuFocus(");
    expect(workspaceItemMenuSource).toContain("ref={contentRef}");
    expect(workspaceItemMenuSource).toContain("onCloseAutoFocus={(event) => {");
    expect(workspaceItemMenuSource).toContain("window.setTimeout(() => restoreWorkspaceItemMenuFocus(returnFocus), 0)");
    expect(workspaceItemMenuSource).toContain("restoreWorkspaceItemMenuFocus(menu.returnFocus)");
  });

  it("places a stateful direct pin control after the stable context-menu trigger", () => {
    expect(sidebarSource.indexOf("<NodeMenu")).toBeLessThan(
      sidebarSource.indexOf('data-sidebar-pin-button="true"')
    );
    expect(sidebarSource).toContain("text-neutral-300 hover:bg-background/70");
    expect(sidebarSource).toContain("hover:text-muted-foreground");
    expect(sidebarSource).toContain("pinned && !projected");
    expect(sidebarSource).toContain("group-hover:opacity-100 group-focus-within:opacity-100");
    expect(sidebarSource).toContain(
      '<PushPin size={16} weight={pinned ? "fill" : "regular"} />'
    );
    expect(sidebarSource).toContain("onPinnedChange(node, !pinned)");
    expect(workspaceItemMenuSource).toContain("return <PushPin size={16} />;");
  });
});

describe("sidebar system-page entries", () => {
  it("places Settings and Uploads above Trash in the bottom group", () => {
    expect(sidebarSource).toContain(
      'import { Gear } from "@phosphor-icons/react/dist/csr/Gear"'
    );
    expect(sidebarSource).toContain("onOpenSettings");
    expect(sidebarSource).toContain("onOpenMedia");
    expect(sidebarSource).toContain("title={`Settings (${settingsShortcut})`}");
    expect(sidebarSource).toContain("title={`Trash (${trashShortcut})`}");
    expect(sidebarSource.indexOf(">Settings</span>")).toBeLessThan(
      sidebarSource.indexOf(">Uploads</span>")
    );
    expect(sidebarSource.indexOf(">Uploads</span>")).toBeLessThan(
      sidebarSource.indexOf(">Trash</span>")
    );
  });

  it("keeps the sidebar free of top and bottom horizontal rules", () => {
    expect(sidebarSource).toContain(
      '<header className="relative z-30 bg-sidebar px-3 pb-5 pt-3">'
    );
    expect(sidebarSource).toContain('<footer className="space-y-0.5 p-2">');
    expect(sidebarSource).not.toContain('<header className="border-b');
    expect(sidebarSource).not.toContain('<footer className="border-t');
  });
});

describe("sidebar active ancestor trail", () => {
  it("restores cached expansion state before the first sidebar render", () => {
    expect(sidebarSource).toContain("initialSidebarExpansion(tree, workspaceKey)");
    expect(sidebarSource).toContain("() => initialExpansion.paths");
    expect(sidebarSource).toContain(
      "initialExpansion.restored ? initialExpansion.workspaceKey : null"
    );
  });

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
    expect(sidebarSource).toContain('? "bg-foreground/70"');
    expect(sidebarSource).not.toContain('active ? "bg-primary/70" : "bg-border"');
  });

  it("uses solid neutral surfaces for the sidebar and active item", () => {
    expect(sidebarSource).toContain("border-border bg-sidebar text-foreground");
    expect(sidebarSource).toContain('isSelected && "bg-accent text-accent-foreground"');
    expect(sidebarSource).not.toContain("bg-muted/35");
    expect(sidebarSource).not.toContain("bg-muted/95");
  });
});

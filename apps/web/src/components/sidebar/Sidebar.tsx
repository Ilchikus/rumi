import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactElement } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { FolderPlus } from "@phosphor-icons/react/dist/csr/FolderPlus";
import { Gear } from "@phosphor-icons/react/dist/csr/Gear";
import { Image } from "@phosphor-icons/react/dist/csr/Image";
import { NotePencil } from "@phosphor-icons/react/dist/csr/NotePencil";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { PushPin } from "@phosphor-icons/react/dist/csr/PushPin";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import type { WorkspaceNode } from "@rumi/contracts";
import { sanitizeWorkspaceName } from "@rumi/workspace-format";
import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { EditorHeaderIconButton } from "../layout/EditorHeaderIconButton";
import {
  readSidebarExpandedPaths,
  shouldRevealSelectionAncestors,
  writeSidebarExpandedPaths
} from "./sidebarPreferences";
import {
  appShortcutPlatform,
  createMenuNumberAction,
  hasPrimaryModifier,
  shortcutLabels
} from "../../lib/appShortcuts";
import type { PageCopyAction } from "../../lib/pageCopyActions";
import {
  isPinnableWorkspaceNode,
  projectPinnedWorkspaceNodes
} from "../../lib/pinnedItems";
import {
  FloatingWorkspaceItemMenu,
  WorkspaceItemMenuItems,
  focusFirstWorkspaceItemMenuAction,
  moveWorkspaceItemMenuFocus,
  restoreWorkspaceItemMenuFocus,
  shouldCreatePageImmediately,
  workspaceItemActionModel,
  workspaceItemCreateKinds
} from "../workspace/WorkspaceItemMenu";
import type {
  FloatingWorkspaceItemMenuState,
  WorkspaceItemCreateKind
} from "../workspace/WorkspaceItemMenu";

export interface SidebarSelection {
  nodePath: string;
  openPath: string | null;
  kind: WorkspaceNode["kind"];
}

interface SidebarProps {
  workspaceName: string;
  workspaceKey: string;
  tree: WorkspaceNode | null;
  selection: SidebarSelection | null;
  trashCount: number;
  trashOpen: boolean;
  mediaOpen: boolean;
  settingsOpen: boolean;
  createTarget: SidebarCreateTarget | null;
  onCreateTargetChange: (target: SidebarCreateTarget | null) => void;
  onPrefetchNode: (node: WorkspaceNode) => void;
  onOpenNode: (node: WorkspaceNode) => void;
  onCreatePage: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder: (parentPath: string, name: string) => Promise<void>;
  onCreateDatabase: (parentPath: string, name: string) => Promise<void>;
  onCreateDefault: (parentPath: string, kind: SidebarCreateKind) => Promise<void>;
  onCopyNode: (node: WorkspaceNode, action: PageCopyAction) => void;
  onRenameNode: (node: WorkspaceNode, nextName: string) => Promise<boolean>;
  onRequestRenameNode: (node: WorkspaceNode) => void;
  onMoveNode: (node: WorkspaceNode) => void;
  onConvertNode: (node: WorkspaceNode) => void;
  pinnedPaths: readonly string[];
  onPinnedChange: (node: WorkspaceNode, pinned: boolean) => void;
  onSeeRevisions: (node: WorkspaceNode) => void;
  onDeleteNode: (node: WorkspaceNode) => Promise<boolean>;
  onOpenSettings: () => void;
  onOpenMedia: () => void;
  onOpenTrash: () => void;
  settingsShortcut: string;
  trashShortcut: string;
}

export type SidebarCreateKind = WorkspaceItemCreateKind;
type CreateKind = SidebarCreateKind;

export function sidebarCreationParentPath(
  tree: WorkspaceNode | null,
  selection: SidebarSelection | null
): string {
  if (!tree || !selection || selection.kind === "workspace") return "";
  if (selection.kind === "folder" || selection.kind === "database") {
    return selection.nodePath;
  }

  let nearestContainerPath = "";
  const visit = (node: WorkspaceNode) => {
    if (
      (node.kind === "folder" || node.kind === "database") &&
      (
        selection.nodePath === node.path ||
        selection.nodePath.startsWith(`${node.path}/`)
      ) &&
      node.path.length > nearestContainerPath.length
    ) {
      nearestContainerPath = node.path;
    }

    for (const child of node.children ?? []) visit(child);
  };

  visit(tree);
  return nearestContainerPath;
}

export function sidebarNodeCreateKinds(
  kind: WorkspaceNode["kind"]
): SidebarCreateKind[] {
  return kind === "workspace" ? [] : workspaceItemCreateKinds(kind);
}

export { shouldCreatePageImmediately };
export const focusFirstSidebarMenuItem = focusFirstWorkspaceItemMenuAction;
export const moveSidebarMenuFocus = moveWorkspaceItemMenuFocus;
export const restoreSidebarContextFocus = restoreWorkspaceItemMenuFocus;

const TREE_INDENT_PX = 20;
const TREE_ROW_HEIGHT_PX = 32;
const TREE_ROW_PADDING_PX = 14;
const CREATE_ROW_PADDING_PX = 39;
const ENTITY_ICON_CLASS = "text-neutral-400";
const EMPTY_STICKY_ANCESTOR_INDEXES = new Map<string, number>();

export interface SidebarCreateTarget {
  parentPath: string;
  kind: CreateKind;
}

interface VisibleTreeNodeRow {
  type: "node";
  key: string;
  node: WorkspaceNode;
  depth: number;
}

interface VisibleTreeCreateRow {
  type: "create";
  key: string;
  parentPath: string;
  kind: CreateKind;
  depth: number;
}

type VisibleTreeRow = VisibleTreeNodeRow | VisibleTreeCreateRow;

type FloatingMenu = FloatingWorkspaceItemMenuState;

interface MoveDestination {
  path: string;
  name: string;
  kind: WorkspaceNode["kind"];
  depth: number;
  disabled: boolean;
  reason?: string;
}

interface InitialSidebarExpansion {
  workspaceKey: string | null;
  restored: boolean;
  paths: Set<string>;
}

export function Sidebar({
  workspaceName,
  workspaceKey,
  tree,
  selection,
  trashCount,
  trashOpen,
  mediaOpen,
  settingsOpen,
  createTarget,
  onCreateTargetChange,
  onPrefetchNode,
  onOpenNode,
  onCreatePage,
  onCreateFolder,
  onCreateDatabase,
  onCreateDefault,
  onCopyNode,
  onRenameNode,
  onRequestRenameNode,
  onMoveNode,
  onConvertNode,
  pinnedPaths,
  onPinnedChange,
  onSeeRevisions,
  onDeleteNode,
  onOpenSettings,
  onOpenMedia,
  onOpenTrash,
  settingsShortcut,
  trashShortcut
}: SidebarProps): ReactElement {
  const initialExpansionRef = useRef<InitialSidebarExpansion | null>(null);
  if (!initialExpansionRef.current) {
    initialExpansionRef.current = initialSidebarExpansion(tree, workspaceKey);
  }
  const initialExpansion = initialExpansionRef.current;
  const initializedExpansionScope = useRef<string | null>(initialExpansion.workspaceKey);
  const restoredExpansionScope = useRef<string | null>(
    initialExpansion.restored ? initialExpansion.workspaceKey : null
  );
  const initialSelectionScope = useRef<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => initialExpansion.paths
  );
  const [renamingRowKey, setRenamingRowKey] = useState<string | null>(null);
  const [floatingMenu, setFloatingMenu] = useState<FloatingMenu | null>(null);
  const pinnedPathSet = useMemo(() => new Set(pinnedPaths), [pinnedPaths]);
  const pinnedTreeNodes = useMemo(
    () => projectPinnedWorkspaceNodes(tree, pinnedPaths),
    [pinnedPaths, tree]
  );
  const initialPinnedContainersRef = useRef(pinnedContainerPaths(pinnedTreeNodes));
  const knownPinnedContainersRef = useRef(initialPinnedContainersRef.current);
  const [pinnedExpandedPaths, setPinnedExpandedPaths] = useState<Set<string>>(
    () => new Set(initialPinnedContainersRef.current)
  );
  const visiblePinnedRows = useMemo(
    () => flattenVisiblePinnedRows(pinnedTreeNodes, pinnedExpandedPaths),
    [pinnedExpandedPaths, pinnedTreeNodes]
  );
  const stickyAncestorIndexes = useMemo(() => {
    const paths = selection ? ancestorPaths(selection.nodePath) : [];
    if (paths.some((path) => !expandedPaths.has(path))) {
      return new Map<string, number>();
    }

    return new Map(paths.map((path, index) => [path, index] as const));
  }, [expandedPaths, selection?.nodePath]);
  const visibleTreeRows = useMemo(
    () => flattenVisibleTreeRows(tree?.children ?? [], expandedPaths, createTarget),
    [createTarget, expandedPaths, tree]
  );
  const activeRowIndex = selection
    ? visibleTreeRows.findIndex(
        (row) => row.type === "node" && row.node.path === selection.nodePath
      )
    : -1;
  const firstStickyPath = stickyAncestorIndexes.keys().next().value as string | undefined;
  const stickyScopeStartIndex = firstStickyPath
    ? visibleTreeRows.findIndex(
        (row) => row.type === "node" && row.node.path === firstStickyPath
      )
    : -1;
  const hasStickyScope =
    stickyScopeStartIndex >= 0 && activeRowIndex > stickyScopeStartIndex;
  const rowsBeforeStickyScope = hasStickyScope
    ? visibleTreeRows.slice(0, stickyScopeStartIndex)
    : visibleTreeRows;
  const stickyScopeRows = hasStickyScope
    ? visibleTreeRows.slice(stickyScopeStartIndex, activeRowIndex)
    : [];
  const rowsAfterStickyScope = hasStickyScope
    ? visibleTreeRows.slice(activeRowIndex)
    : [];

  const updateExpandedPaths = useCallback((
    update: (current: Set<string>) => Set<string>
  ) => {
    setExpandedPaths((current) => {
      const next = update(current);
      writeSidebarExpandedPaths(browserStorage(), workspaceKey, next);
      return next;
    });
  }, [workspaceKey]);

  useEffect(() => {
    const availablePaths = pinnedContainerPaths(pinnedTreeNodes);
    const knownPaths = knownPinnedContainersRef.current;
    knownPinnedContainersRef.current = availablePaths;
    setPinnedExpandedPaths((current) => {
      const next = new Set([...current].filter((path) => availablePaths.has(path)));
      for (const path of availablePaths) {
        if (!knownPaths.has(path)) next.add(path);
      }
      return samePathSet(current, next) ? current : next;
    });
  }, [pinnedTreeNodes]);

  useEffect(() => {
    if (!createTarget) return;
    setFloatingMenu(null);
    setRenamingRowKey(null);
    if (createTarget.parentPath) {
      updateExpandedPaths((current) => new Set(current).add(createTarget.parentPath));
    }
  }, [createTarget, updateExpandedPaths]);

  useEffect(() => {
    if (!tree || initializedExpansionScope.current === workspaceKey) {
      return;
    }

    initializedExpansionScope.current = workspaceKey;
    const availablePaths = sidebarContainerPaths(tree);
    const savedPaths = readSidebarExpandedPaths(browserStorage(), workspaceKey);
    restoredExpansionScope.current = savedPaths ? workspaceKey : null;
    initialSelectionScope.current = null;
    const next = savedPaths
      ? new Set([...savedPaths].filter((path) => availablePaths.has(path)))
      : new Set((tree.children ?? []).filter(isContainerNode).map((node) => node.path));
    setExpandedPaths(next);
    writeSidebarExpandedPaths(browserStorage(), workspaceKey, next);
  }, [tree, workspaceKey]);

  useEffect(() => {
    if (!selection) {
      return;
    }

    const initialSelection = initialSelectionScope.current !== workspaceKey;
    if (initialSelection) {
      initialSelectionScope.current = workspaceKey;
    }
    if (!shouldRevealSelectionAncestors(
      restoredExpansionScope.current === workspaceKey,
      initialSelection
    )) return;

    const paths = ancestorPaths(selection.nodePath);
    const openPaths = selection.openPath ? ancestorPaths(selection.openPath) : [];
    updateExpandedPaths((current) => {
      const next = new Set(current);

      for (const path of [...paths, ...openPaths]) {
        next.add(path);
      }

      return next;
    });
  }, [selection, updateExpandedPaths, workspaceKey]);

  const startCreate = useCallback((parentPath: string, kind: CreateKind) => {
    setFloatingMenu(null);
    setRenamingRowKey(null);
    onCreateTargetChange({ parentPath, kind });

    if (parentPath) {
      updateExpandedPaths((current) => new Set(current).add(parentPath));
    }
  }, [onCreateTargetChange, updateExpandedPaths]);

  const createDefault = useCallback((parentPath: string, kind: CreateKind) => {
    setFloatingMenu(null);
    setRenamingRowKey(null);
    onCreateTargetChange(null);

    if (parentPath) {
      updateExpandedPaths((current) => new Set(current).add(parentPath));
    }

    return onCreateDefault(parentPath, kind);
  }, [onCreateDefault, onCreateTargetChange, updateExpandedPaths]);

  const startRename = useCallback((rowKey: string) => {
    setFloatingMenu(null);
    onCreateTargetChange(null);
    setRenamingRowKey(rowKey);
  }, [onCreateTargetChange]);

  const requestRename = useCallback((node: WorkspaceNode) => {
    setFloatingMenu(null);
    onCreateTargetChange(null);
    setRenamingRowKey(null);
    onRequestRenameNode(node);
  }, [onCreateTargetChange, onRequestRenameNode]);

  const requestDelete = useCallback((node: WorkspaceNode) => {
    setFloatingMenu(null);
    onCreateTargetChange(null);
    setRenamingRowKey(null);
    void onDeleteNode(node);
  }, [onCreateTargetChange, onDeleteNode]);

  const requestMove = useCallback((node: WorkspaceNode) => {
    setFloatingMenu(null);
    onCreateTargetChange(null);
    setRenamingRowKey(null);
    onMoveNode(node);
  }, [onCreateTargetChange, onMoveNode]);

  const requestConvert = useCallback((node: WorkspaceNode) => {
    setFloatingMenu(null);
    onCreateTargetChange(null);
    setRenamingRowKey(null);
    onConvertNode(node);
  }, [onConvertNode, onCreateTargetChange]);

  const toggleExpanded = useCallback((path: string) => {
    updateExpandedPaths((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }, [updateExpandedPaths]);

  const togglePinnedExpanded = useCallback((path: string) => {
    setPinnedExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const openRootMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;

    if (target?.closest("[data-sidebar-node='true']")) {
      return;
    }

    if (!tree) return;
    event.preventDefault();
    setFloatingMenu({
      node: tree,
      point: { x: event.clientX, y: event.clientY },
      returnFocus: null
    });
  }, [tree]);

  const openNodeMenu = useCallback((node: WorkspaceNode, event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const returnFocus = target.closest<HTMLElement>("button")
      ?? event.currentTarget.querySelector<HTMLElement>("button:not(:disabled)");
    setFloatingMenu({
      node,
      point: { x: event.clientX, y: event.clientY },
      returnFocus
    });
  }, []);

  const renderVisibleTreeRow = (
    row: VisibleTreeRow,
    gridRow?: number
  ): ReactElement => {
    if (row.type === "create") {
      return (
        <div
          key={row.key}
          style={gridRow === undefined ? undefined : {
            gridColumn: 1,
            gridRowStart: gridRow
          }}
        >
          <CreateInput
            depth={row.depth}
            kind={row.kind}
            parentPath={row.parentPath}
            onCancel={() => onCreateTargetChange(null)}
            onCreatePage={onCreatePage}
            onCreateFolder={onCreateFolder}
            onCreateDatabase={onCreateDatabase}
          />
        </div>
      );
    }

    const pinnedRow = row.key.startsWith("pinned-node:");
    return (
      <TreeNode
        key={row.key}
        node={row.node}
        depth={row.depth}
        {...(gridRow === undefined ? {} : { gridRow })}
        selection={selection}
        stickyAncestorIndexes={pinnedRow ? EMPTY_STICKY_ANCESTOR_INDEXES : stickyAncestorIndexes}
        expandedPaths={pinnedRow ? pinnedExpandedPaths : expandedPaths}
        projected={pinnedRow}
        renaming={renamingRowKey === row.key}
        pinned={pinnedPathSet.has(row.node.path)}
        onPrefetchNode={onPrefetchNode}
        onOpenNode={onOpenNode}
        onToggleExpanded={pinnedRow ? togglePinnedExpanded : toggleExpanded}
        onStartCreate={startCreate}
        onCreateDefault={createDefault}
        onCopyNode={onCopyNode}
        onStartRename={() => startRename(row.key)}
        onRequestRename={requestRename}
        onRenameNode={onRenameNode}
        onMoveNode={requestMove}
        onConvertNode={requestConvert}
        onPinnedChange={onPinnedChange}
        onSeeRevisions={onSeeRevisions}
        onDeleteNode={requestDelete}
        onCancelRename={() => setRenamingRowKey(null)}
        onOpenContextMenu={openNodeMenu}
      />
    );
  };

  return (
    <aside className="grid h-full min-h-0 min-w-0 w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-r border-border bg-sidebar text-foreground">
      <header className="relative z-30 bg-sidebar px-3 pb-5 pt-3">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-md text-left transition-opacity hover:opacity-70 disabled:cursor-default disabled:hover:opacity-100"
              disabled={!tree}
              title={tree ? `Open ${workspaceName}` : undefined}
              onClick={() => {
                if (tree) onOpenNode(tree);
              }}
            >
              <span className="h-7 w-7 shrink-0" aria-hidden="true">
                <img
                  src="/rumi-logo.svg?v=20260819-1"
                  alt=""
                  className="block h-full w-full object-contain"
                />
              </span>
              <span className="truncate text-lg font-semibold">{workspaceName}</span>
            </button>
          </h1>
        </div>
      </header>

      <div
        className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain"
        onContextMenu={openRootMenu}
      >
        {tree ? (
          <div className="pb-8">
            {visiblePinnedRows.length > 0 && (
              <section
                aria-label="Pinned items"
                data-sidebar-pinned-items=""
                className="mb-2 border-b border-border pb-2"
              >
                {visiblePinnedRows.map((row) => renderVisibleTreeRow(row))}
              </section>
            )}
            <CreateSlot
              target={createTarget}
              parentPath=""
              depth={0}
              onCancel={() => onCreateTargetChange(null)}
              onCreatePage={onCreatePage}
              onCreateFolder={onCreateFolder}
              onCreateDatabase={onCreateDatabase}
            />
            {rowsBeforeStickyScope.map((row) => renderVisibleTreeRow(row))}
            {hasStickyScope && (
              <div
                className="grid"
                style={{
                  gridTemplateRows: `repeat(${
                    stickyScopeRows.length
                  }, ${TREE_ROW_HEIGHT_PX}px)`
                }}
              >
                {stickyScopeRows.map((row, index) =>
                  renderVisibleTreeRow(row, index + 1)
                )}
              </div>
            )}
            {rowsAfterStickyScope.map((row) => renderVisibleTreeRow(row))}
          </div>
        ) : null}
      </div>

      <footer className="space-y-0.5 p-2">
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
            settingsOpen
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          onClick={onOpenSettings}
          title={`Settings (${settingsShortcut})`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center"><Gear size={17} /></span>
          <span className="min-w-0 flex-1 truncate">Settings</span>
        </button>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
            mediaOpen
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          aria-current={mediaOpen ? "page" : undefined}
          onClick={onOpenMedia}
          title="Uploads"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center"><Image size={17} /></span>
          <span className="min-w-0 flex-1 truncate">Uploads</span>
        </button>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
            trashOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          aria-current={trashOpen ? "page" : undefined}
          onClick={onOpenTrash}
          title={`Trash (${trashShortcut})`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center"><Trash size={17} /></span>
          <span className="min-w-0 flex-1 truncate">Trash</span>
          {trashCount > 0 && (
            <span className="min-w-5 rounded-full bg-muted px-1.5 py-0.5 text-center text-[11px] tabular-nums text-muted-foreground">
              {trashCount > 99 ? "99+" : trashCount}
            </span>
          )}
        </button>
      </footer>

      {floatingMenu && (
        <FloatingWorkspaceItemMenu
          menu={floatingMenu}
          onOpenChange={(open) => {
            if (!open) {
              setFloatingMenu(null);
            }
          }}
          onCreate={startCreate}
          onCreateDefault={createDefault}
          onCopy={onCopyNode}
          pinned={pinnedPathSet.has(floatingMenu.node.path)}
          onRename={requestRename}
          onMove={requestMove}
          onConvert={requestConvert}
          onPinnedChange={onPinnedChange}
          onSeeRevisions={onSeeRevisions}
          onDelete={requestDelete}
        />
      )}
    </aside>
  );
}

interface TreeNodeProps {
  node: WorkspaceNode;
  depth: number;
  gridRow?: number;
  selection: SidebarSelection | null;
  stickyAncestorIndexes: ReadonlyMap<string, number>;
  expandedPaths: Set<string>;
  projected: boolean;
  renaming: boolean;
  pinned: boolean;
  onPrefetchNode: (node: WorkspaceNode) => void;
  onOpenNode: (node: WorkspaceNode) => void;
  onToggleExpanded: (path: string) => void;
  onStartCreate: (parentPath: string, kind: CreateKind) => void;
  onCreateDefault: (parentPath: string, kind: CreateKind) => Promise<void>;
  onCopyNode: (node: WorkspaceNode, action: PageCopyAction) => void;
  onStartRename: () => void;
  onRequestRename: (node: WorkspaceNode) => void;
  onRenameNode: (node: WorkspaceNode, nextName: string) => Promise<boolean>;
  onMoveNode: (node: WorkspaceNode) => void;
  onConvertNode: (node: WorkspaceNode) => void;
  onPinnedChange: (node: WorkspaceNode, pinned: boolean) => void;
  onSeeRevisions: (node: WorkspaceNode) => void;
  onDeleteNode: (node: WorkspaceNode) => void;
  onCancelRename: () => void;
  onOpenContextMenu: (node: WorkspaceNode, event: MouseEvent<HTMLElement>) => void;
}

function TreeNode({
  node,
  depth,
  gridRow,
  selection,
  stickyAncestorIndexes,
  expandedPaths,
  projected,
  renaming,
  pinned,
  onPrefetchNode,
  onOpenNode,
  onToggleExpanded,
  onStartCreate,
  onCreateDefault,
  onCopyNode,
  onStartRename,
  onRequestRename,
  onRenameNode,
  onMoveNode,
  onConvertNode,
  onPinnedChange,
  onSeeRevisions,
  onDeleteNode,
  onCancelRename,
  onOpenContextMenu
}: TreeNodeProps): ReactElement {
  const isContainer = isContainerNode(node) && (
    !projected || (node.children?.length ?? 0) > 0
  );
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selection?.nodePath === node.path || selection?.openPath === node.path;
  const stickyAncestorIndex = isContainer
    ? stickyAncestorIndexes.get(node.path)
    : undefined;
  const isActiveAncestor = stickyAncestorIndex !== undefined;
  // Every footprint ends at the same stacked edge. The grid scope ends directly
  // before the active row, so native sticky containment releases them together.
  const stickyFootprintRows = isActiveAncestor
    ? stickyAncestorIndexes.size - stickyAncestorIndex
    : 0;
  const hasItemActions = workspaceItemActionModel(node, { pinned }).length > 0;

  const treeRow = (
    <div
      className={cn(
        "rumi-sidebar-node group relative flex h-8 items-center gap-1 rounded-md pr-3 text-sm",
        isActiveAncestor && "pointer-events-auto bg-sidebar hover:bg-accent",
        !isActiveAncestor && !isSelected && "hover:bg-accent",
        isSelected && "bg-accent text-accent-foreground"
      )}
      style={{
        paddingLeft: TREE_ROW_PADDING_PX + depth * TREE_INDENT_PX,
        ...(gridRow !== undefined && !isActiveAncestor
          ? {
              gridColumn: 1,
              gridRowStart: gridRow
            }
          : {})
      }}
      data-sidebar-node="true"
      data-sidebar-sticky-ancestor={isActiveAncestor ? "true" : undefined}
      data-sidebar-active-item={
        selection?.nodePath === node.path ? "true" : undefined
      }
      onContextMenu={hasItemActions
        ? (event) => onOpenContextMenu(node, event)
        : undefined}
      aria-level={depth + 1}
    >
      <TreeDepthGuides
        depth={depth}
        nodePath={node.path}
        stickyAncestorIndexes={stickyAncestorIndexes}
      />
      <button
        type="button"
        className={cn(
          "grid h-6 w-5 shrink-0 place-items-center rounded text-muted-foreground",
          isContainer && "hover:bg-background/70 hover:text-foreground"
        )}
        disabled={!isContainer}
        onClick={(event) => {
          event.stopPropagation();
          if (isContainer) {
            onToggleExpanded(node.path);
          }
        }}
        aria-label={isExpanded ? "Collapse" : "Expand"}
      >
        {isContainer ? (
          isExpanded ? <CaretDown size={13} weight="bold" /> : <CaretRight size={13} weight="bold" />
        ) : (
          <span />
        )}
      </button>

      <button
        type="button"
        className="grid h-6 w-5 shrink-0 place-items-center text-muted-foreground"
        onPointerEnter={() => onPrefetchNode(node)}
        onPointerDown={() => onPrefetchNode(node)}
        onFocus={() => onPrefetchNode(node)}
        onClick={() => onOpenNode(node)}
        onDoubleClick={(event) => {
          event.preventDefault();
          onStartRename();
        }}
        aria-label={`Open ${displayName(node.name)}`}
      >
        <NodeIcon kind={node.kind} expanded={isExpanded} />
      </button>

      {renaming ? (
        <RenameInput
          node={node}
          onCancel={onCancelRename}
          onRename={onRenameNode}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onPointerEnter={() => onPrefetchNode(node)}
          onPointerDown={() => onPrefetchNode(node)}
          onFocus={() => onPrefetchNode(node)}
          onClick={() => onOpenNode(node)}
          onDoubleClick={(event) => {
            event.preventDefault();
            onStartRename();
          }}
        >
          <span className={cn("truncate", isSelected && "font-semibold")}>{displayName(node.name)}</span>
        </button>
      )}

      {hasItemActions && (
        <NodeMenu
          node={node}
          onCreate={onStartCreate}
          onCreateDefault={onCreateDefault}
          onCopy={onCopyNode}
          pinned={pinned}
          onRename={onRequestRename}
          onMove={onMoveNode}
          onConvert={onConvertNode}
          onPinnedChange={onPinnedChange}
          onSeeRevisions={onSeeRevisions}
          onDelete={onDeleteNode}
        />
      )}

      {isPinnableWorkspaceNode(node) && (
        <button
          type="button"
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-300 hover:bg-background/70 hover:text-muted-foreground focus-visible:opacity-100",
            pinned && !projected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          )}
          aria-label={`${pinned ? "Unpin" : "Pin"} ${displayName(node.name)}`}
          aria-pressed={pinned}
          data-sidebar-pin-button="true"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onPinnedChange(node, !pinned);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <PushPin size={16} weight={pinned ? "fill" : "regular"} />
        </button>
      )}
    </div>
  );

  if (!isActiveAncestor || gridRow === undefined) {
    return treeRow;
  }

  return (
    <div
      className="pointer-events-none sticky self-stretch"
      style={{
        gridColumn: 1,
        gridRow: `${gridRow} / span ${stickyFootprintRows}`,
        top: stickyAncestorIndex * TREE_ROW_HEIGHT_PX,
        zIndex: Math.max(1, 20 - stickyAncestorIndex)
      }}
      data-sidebar-sticky-footprint="true"
    >
      {treeRow}
    </div>
  );
}

function NodeMenu({
  node,
  pinned,
  onCreate,
  onCreateDefault,
  onCopy,
  onRename,
  onMove,
  onConvert,
  onPinnedChange,
  onSeeRevisions,
  onDelete
}: {
  node: WorkspaceNode;
  pinned: boolean;
  onCreate: (parentPath: string, kind: CreateKind) => void;
  onCreateDefault: (parentPath: string, kind: CreateKind) => Promise<void>;
  onCopy: (node: WorkspaceNode, action: PageCopyAction) => void;
  onRename: (node: WorkspaceNode) => void;
  onMove: (node: WorkspaceNode) => void;
  onConvert: (node: WorkspaceNode) => void;
  onPinnedChange: (node: WorkspaceNode, pinned: boolean) => void;
  onSeeRevisions: (node: WorkspaceNode) => void;
  onDelete: (node: WorkspaceNode) => void;
}): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rumi-sidebar-node-menu grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-100 hover:bg-background/70 hover:text-foreground data-[state=open]:opacity-100"
          aria-label={`Actions for ${displayName(node.name)}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <DotsThree size={18} weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <WorkspaceItemMenuItems
          node={node}
          pinned={pinned}
          onCreate={onCreate}
          onCreateDefault={onCreateDefault}
          onCopy={onCopy}
          onRename={onRename}
          onMove={onMove}
          onConvert={onConvert}
          onPinnedChange={onPinnedChange}
          onSeeRevisions={onSeeRevisions}
          onDelete={onDelete}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TreeDepthGuides({
  depth,
  nodePath,
  stickyAncestorIndexes
}: {
  depth: number;
  nodePath: string;
  stickyAncestorIndexes: ReadonlyMap<string, number>;
}): ReactElement {
  const rowAncestorPaths = ancestorPaths(nodePath);

  return (
    <>
      {Array.from({ length: depth }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 w-px",
            stickyAncestorIndexes.has(rowAncestorPaths[index] ?? "")
              ? "bg-foreground/70"
              : "bg-border"
          )}
          style={{ left: (index + 1) * TREE_INDENT_PX }}
        />
      ))}
    </>
  );
}

export function RootCreateMenu({
  open,
  parentPath,
  onOpenChange,
  onCreate,
  onCreateDefault
}: {
  open: boolean;
  parentPath: string;
  onOpenChange: (open: boolean) => void;
  onCreate: (parentPath: string, kind: CreateKind) => void;
  onCreateDefault: (parentPath: string, kind: CreateKind) => Promise<void>;
}): ReactElement {
  const platform = appShortcutPlatform();
  const labels = shortcutLabels(platform);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const immediatePointerKindRef = useRef<CreateKind | null>(null);
  const numberedSelectionRef = useRef<number | null>(null);

  useEffect(() => {
    numberedSelectionRef.current = null;
    if (!open) return;

    const animationFrame = window.requestAnimationFrame(() => {
      itemRefs.current[0]?.focus();
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [open]);

  const createImmediately = (kind: CreateKind) => {
    onOpenChange(false);
    void onCreateDefault(parentPath, kind).catch(() => undefined);
  };

  const createOptions: Array<{
    kind: CreateKind;
    label: string;
    icon: ReactElement;
  }> = [
    { kind: "page", label: "New Page", icon: <NotePencil size={16} /> },
    { kind: "folder", label: "New Folder", icon: <FolderPlus size={16} /> },
    { kind: "database", label: "New Database", icon: <Table size={16} /> }
  ];

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <EditorHeaderIconButton aria-label="Create new" title={`Create (${labels.create})`}>
          <Plus size={17} />
        </EditorHeaderIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-48"
        onKeyDown={(event) => {
          const numberAction = createMenuNumberAction(
            event,
            numberedSelectionRef.current
          );
          if (!numberAction) return;
          event.preventDefault();
          event.stopPropagation();

          const option = createOptions[numberAction.index];
          if (!option) return;
          if (numberAction.action === "focus") {
            numberedSelectionRef.current = numberAction.index;
            itemRefs.current[numberAction.index]?.focus();
            return;
          }

          numberedSelectionRef.current = null;
          createImmediately(option.kind);
        }}
      >
        {createOptions.map((option, index) => (
          <DropdownMenuItem
            key={option.kind}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            onPointerDown={(event) => {
              immediatePointerKindRef.current = hasPrimaryModifier(event, platform)
                ? option.kind
                : null;
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !hasPrimaryModifier(event, platform)) return;
              event.preventDefault();
              event.stopPropagation();
              createImmediately(option.kind);
            }}
            onSelect={() => {
              if (immediatePointerKindRef.current === option.kind) {
                immediatePointerKindRef.current = null;
                createImmediately(option.kind);
                return;
              }

              immediatePointerKindRef.current = null;
              onCreate(parentPath, option.kind);
            }}
          >
            {option.icon}
            <span>{option.label}</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-hidden="true">
              {index + 1}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RenameNodeDialog({
  node,
  onOpenChange,
  onConfirm
}: {
  node: WorkspaceNode | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (nextName: string) => Promise<boolean>;
}): ReactElement {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(node ? displayName(node.name) : "");
    setBusy(false);
  }, [node]);

  const submit = async () => {
    if (!node || busy) return;
    const finalName = sanitizeWorkspaceName(name).sanitized.trim();
    if (!finalName) return;
    if (finalName === displayName(node.name)) {
      onOpenChange(false);
      return;
    }

    setBusy(true);
    if (await onConfirm(finalName)) {
      onOpenChange(false);
      return;
    }
    setBusy(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
  };

  return (
    <Dialog open={Boolean(node)} onOpenChange={(open) => {
      if (!busy) onOpenChange(open);
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename item</DialogTitle>
          <DialogDescription>
            Rename <span className="font-medium text-foreground">{node?.path}</span>.
          </DialogDescription>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={name}
          disabled={busy}
          autoFocus
          aria-label="Item name"
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void submit();
          }}
          onChange={(event) => setName(sanitizeWorkspaceName(event.target.value).sanitized)}
        />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {busy ? "Renaming" : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveNodeDialog({
  tree,
  node,
  busy,
  onOpenChange,
  onConfirm
}: {
  tree: WorkspaceNode | null;
  node: WorkspaceNode | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newParentPath: string) => Promise<void>;
}): ReactElement {
  const destinations = useMemo(() => {
    if (!tree || !node) {
      return [];
    }

    return moveDestinationsForTree(tree, node);
  }, [node, tree]);
  const [selectedPath, setSelectedPath] = useState("");

  useEffect(() => {
    if (!node) {
      setSelectedPath("");
      return;
    }

    setSelectedPath((current) => {
      const currentDestination = destinations.find((destination) => destination.path === current);

      if (currentDestination && !currentDestination.disabled) {
        return current;
      }

      return destinations.find((destination) => !destination.disabled)?.path ?? "";
    });
  }, [destinations, node]);

  const selectedDestination = destinations.find((destination) => destination.path === selectedPath && !destination.disabled);

  return (
    <Dialog open={Boolean(node)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move item</DialogTitle>
          <DialogDescription>
            {node ? (
              <>
                Move <span className="font-medium text-foreground">{node.path}</span> to:
              </>
            ) : (
              "Move item to:"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-auto rounded-md border border-border p-1">
          {destinations.length ? (
            destinations.map((destination) => {
              const selected = selectedDestination?.path === destination.path;

              return (
                <button
                  key={destination.path || "__root__"}
                  type="button"
                  disabled={busy || destination.disabled}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-sm pr-2 text-left text-sm outline-none transition-colors",
                    "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    selected && "bg-accent text-accent-foreground",
                    destination.disabled && "cursor-not-allowed opacity-50"
                  )}
                  style={{ paddingLeft: 8 + destination.depth * TREE_INDENT_PX }}
                  title={destination.reason}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => setSelectedPath(destination.path)}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center">
                    <EntityIcon kind={destination.kind} expanded={selected} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{destination.name}</span>
                  {destination.reason && (
                    <span className="shrink-0 text-xs text-muted-foreground">{destination.reason}</span>
                  )}
                </button>
              );
            })
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">No destination folders found.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !selectedDestination}
            onClick={() => {
              if (selectedDestination) {
                void onConfirm(selectedDestination.path);
              }
            }}
          >
            {busy ? "Moving" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConvertNodeDialog({
  node,
  busy,
  onOpenChange,
  onConfirm
}: {
  node: WorkspaceNode | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}): ReactElement {
  const toDatabase = node?.kind === "folder";

  return (
    <AlertDialog open={Boolean(node)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {toDatabase ? "Convert folder to database" : "Convert database to folder"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {toDatabase
              ? "Properties from pages directly inside this folder will be merged into one database schema. Missing properties will be added to every page."
              : "The database schema will be removed from the folder page. Existing properties on its pages will be kept."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancelButton disabled={busy}>Cancel</AlertDialogCancelButton>
          <AlertDialogActionButton
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? "Converting" : toDatabase ? "Convert to database" : "Convert to folder"}
          </AlertDialogActionButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateSlot({
  target,
  parentPath,
  depth,
  onCancel,
  onCreatePage,
  onCreateFolder,
  onCreateDatabase
}: {
  target: SidebarCreateTarget | null;
  parentPath: string;
  depth: number;
  onCancel: () => void;
  onCreatePage: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder: (parentPath: string, name: string) => Promise<void>;
  onCreateDatabase: (parentPath: string, name: string) => Promise<void>;
}): ReactElement | null {
  if (!target || target.parentPath !== parentPath) {
    return null;
  }

  return (
    <CreateInput
      depth={depth}
      kind={target.kind}
      parentPath={parentPath}
      onCancel={onCancel}
      onCreatePage={onCreatePage}
      onCreateFolder={onCreateFolder}
      onCreateDatabase={onCreateDatabase}
    />
  );
}

function CreateInput({
  depth,
  kind,
  parentPath,
  onCancel,
  onCreatePage,
  onCreateFolder,
  onCreateDatabase
}: {
  depth: number;
  kind: CreateKind;
  parentPath: string;
  onCancel: () => void;
  onCreatePage: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder: (parentPath: string, name: string) => Promise<void>;
  onCreateDatabase: (parentPath: string, name: string) => Promise<void>;
}): ReactElement {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    return focusInlineNameInput(inputRef, false);
  }, []);

  const close = useCallback(() => {
    dismissedRef.current = true;
    onCancel();
  }, [onCancel]);

  const submit = useCallback(async () => {
    if (busyRef.current || dismissedRef.current) {
      return;
    }

    const finalName = sanitizeWorkspaceName(name).sanitized.trim();

    if (!finalName) {
      close();
      return;
    }

    busyRef.current = true;
    setBusy(true);

    try {
      if (kind === "page") {
        await onCreatePage(parentPath, finalName);
      } else if (kind === "folder") {
        await onCreateFolder(parentPath, finalName);
      } else {
        await onCreateDatabase(parentPath, finalName);
      }

      close();
    } catch {
      busyRef.current = false;
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [close, kind, name, onCreateDatabase, onCreateFolder, onCreatePage, parentPath]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  useOutsidePointerDown(inputRef, () => {
    if (!dismissedRef.current) {
      void submit();
    }
  });

  return (
    <div
      className="flex h-8 items-center gap-1 pr-3"
      style={{ paddingLeft: CREATE_ROW_PADDING_PX + depth * TREE_INDENT_PX }}
      aria-level={depth + 1}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center">
        <EntityIcon kind={kind} />
      </span>
      <Input
        ref={inputRef}
        value={name}
        disabled={busy}
        placeholder={kind === "page" ? "Page name" : kind === "folder" ? "Folder name" : "Database name"}
        className="h-7 min-w-0 flex-1 px-2"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        onChange={(event) => setName(sanitizeWorkspaceName(event.target.value).sanitized)}
      />
    </div>
  );
}

function RenameInput({
  node,
  onCancel,
  onRename
}: {
  node: WorkspaceNode;
  onCancel: () => void;
  onRename: (node: WorkspaceNode, nextName: string) => Promise<boolean>;
}): ReactElement {
  const [name, setName] = useState(displayName(node.name));
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    return focusInlineNameInput(inputRef, true);
  }, []);

  const close = useCallback(() => {
    dismissedRef.current = true;
    onCancel();
  }, [onCancel]);

  const submit = useCallback(async () => {
    if (busyRef.current || dismissedRef.current) {
      return;
    }

    const finalName = sanitizeWorkspaceName(name).sanitized.trim();

    if (!finalName || finalName === displayName(node.name)) {
      close();
      return;
    }

    busyRef.current = true;
    setBusy(true);

    const completed = await onRename(node, finalName);

    if (completed) {
      close();
      return;
    }

    busyRef.current = false;
    setBusy(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [close, name, node, onRename]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  useOutsidePointerDown(inputRef, () => {
    if (!dismissedRef.current) {
      void submit();
    }
  });

  return (
    <Input
      ref={inputRef}
      value={name}
      disabled={busy}
      className="h-7 min-w-0 flex-1 px-2"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onChange={(event) => setName(sanitizeWorkspaceName(event.target.value).sanitized)}
    />
  );
}

function focusInlineNameInput(ref: { current: HTMLInputElement | null }, select: boolean): () => void {
  let animationFrame = 0;
  const timeout = window.setTimeout(() => {
    animationFrame = window.requestAnimationFrame(() => {
      ref.current?.focus();

      if (select) {
        ref.current?.select();
      }
    });
  }, 0);

  return () => {
    window.clearTimeout(timeout);

    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
    }
  };
}

function useOutsidePointerDown<T extends HTMLElement>(
  ref: { current: T | null },
  onOutsidePointerDown: () => void
): void {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node) || ref.current?.contains(target)) {
        return;
      }

      onOutsidePointerDown();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onOutsidePointerDown, ref]);
}

function NodeIcon({ kind, expanded }: { kind: WorkspaceNode["kind"]; expanded: boolean }): ReactElement {
  return <EntityIcon kind={kind} expanded={expanded} />;
}

function EntityIcon({
  kind,
  expanded = false
}: {
  kind: WorkspaceNode["kind"] | CreateKind;
  expanded?: boolean;
}): ReactElement {
  if (kind === "database") {
    return <Table size={16} className={ENTITY_ICON_CLASS} />;
  }

  if (kind === "folder" || kind === "workspace") {
    return expanded ? (
      <FolderOpen size={16} className={ENTITY_ICON_CLASS} />
    ) : (
      <Folder size={16} className={ENTITY_ICON_CLASS} />
    );
  }

  if (kind === "page") {
    return <FileText size={16} className={ENTITY_ICON_CLASS} />;
  }

  return <FileText size={16} className={ENTITY_ICON_CLASS} />;
}

function flattenVisibleTreeRows(
  nodes: WorkspaceNode[],
  expandedPaths: ReadonlySet<string>,
  createTarget: SidebarCreateTarget | null,
  depth = 0,
  rows: VisibleTreeRow[] = []
): VisibleTreeRow[] {
  for (const node of nodes) {
    rows.push({
      type: "node",
      key: `node:${node.path}`,
      node,
      depth
    });

    if (!isContainerNode(node) || !expandedPaths.has(node.path)) {
      continue;
    }

    if (createTarget?.parentPath === node.path) {
      rows.push({
        type: "create",
        key: `create:${node.path}:${createTarget.kind}`,
        parentPath: node.path,
        kind: createTarget.kind,
        depth: depth + 1
      });
    }

    flattenVisibleTreeRows(
      node.children ?? [],
      expandedPaths,
      createTarget,
      depth + 1,
      rows
    );
  }

  return rows;
}

function flattenVisiblePinnedRows(
  nodes: WorkspaceNode[],
  expandedPaths: ReadonlySet<string>,
  depth = 0,
  rows: VisibleTreeNodeRow[] = []
): VisibleTreeNodeRow[] {
  for (const node of nodes) {
    rows.push({
      type: "node",
      key: `pinned-node:${node.path}`,
      node,
      depth
    });

    if (!isContainerNode(node) || !expandedPaths.has(node.path)) continue;
    flattenVisiblePinnedRows(node.children ?? [], expandedPaths, depth + 1, rows);
  }

  return rows;
}

function pinnedContainerPaths(nodes: readonly WorkspaceNode[]): Set<string> {
  const paths = new Set<string>();
  const visit = (node: WorkspaceNode) => {
    if (isContainerNode(node) && (node.children?.length ?? 0) > 0) paths.add(node.path);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return paths;
}

function samePathSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((path) => right.has(path));
}

function isContainerNode(node: WorkspaceNode): boolean {
  return node.kind === "workspace" || node.kind === "folder" || node.kind === "database";
}

function sidebarContainerPaths(tree: WorkspaceNode): Set<string> {
  const paths = new Set<string>();

  const visit = (node: WorkspaceNode) => {
    for (const child of node.children ?? []) {
      if (!isContainerNode(child)) continue;
      paths.add(child.path);
      visit(child);
    }
  };

  visit(tree);
  return paths;
}

function initialSidebarExpansion(
  tree: WorkspaceNode | null,
  workspaceKey: string
): InitialSidebarExpansion {
  if (!tree || !workspaceKey) {
    return { workspaceKey: null, restored: false, paths: new Set() };
  }

  const availablePaths = sidebarContainerPaths(tree);
  const savedPaths = readSidebarExpandedPaths(browserStorage(), workspaceKey);
  return {
    workspaceKey,
    restored: savedPaths !== null,
    paths: savedPaths
      ? new Set([...savedPaths].filter((path) => availablePaths.has(path)))
      : new Set((tree.children ?? []).filter(isContainerNode).map((node) => node.path))
  };
}

function moveDestinationsForTree(tree: WorkspaceNode, node: WorkspaceNode): MoveDestination[] {
  const destinations: MoveDestination[] = [];
  const currentParent = parentPathFor(node.path);

  const visit = (container: WorkspaceNode, depth: number, name: string) => {
    const reason = moveDestinationDisabledReason(container, node, currentParent);
    const destination: MoveDestination = {
      path: container.path,
      name,
      kind: container.kind,
      depth,
      disabled: Boolean(reason)
    };

    if (reason) {
      destination.reason = reason;
    }

    destinations.push(destination);

    for (const child of container.children ?? []) {
      if (isContainerNode(child)) {
        visit(child, depth + 1, displayName(child.name));
      }
    }
  };

  visit(tree, 0, "Workspace root");
  return destinations;
}

function moveDestinationDisabledReason(
  destination: WorkspaceNode,
  node: WorkspaceNode,
  currentParent: string
): string | undefined {
  if (destination.path === currentParent) {
    return "Current";
  }

  if (isContainerNode(node) && isPathInside(destination.path, node.path)) {
    return "Inside";
  }

  if ((destination.children ?? []).some((child) => child.name === node.name && child.path !== node.path)) {
    return "Exists";
  }

  return undefined;
}

function parentPathFor(nodePath: string): string {
  const parts = nodePath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function displayName(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

function ancestorPaths(nodePath: string): string[] {
  const parts = nodePath.split("/").filter(Boolean);
  const ancestors: string[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }

  return ancestors;
}

function isPathInside(candidate: string | null | undefined, parentPath: string): boolean {
  if (!candidate) {
    return false;
  }

  return candidate === parentPath || candidate.startsWith(`${parentPath}/`);
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

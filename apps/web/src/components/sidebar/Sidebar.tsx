import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactElement } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { FolderPlus } from "@phosphor-icons/react/dist/csr/FolderPlus";
import { NotePencil } from "@phosphor-icons/react/dist/csr/NotePencil";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { SidebarSimple } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

export interface SidebarSelection {
  nodePath: string;
  openPath: string | null;
  kind: WorkspaceNode["kind"];
}

interface SidebarProps {
  workspaceName: string;
  tree: WorkspaceNode | null;
  selection: SidebarSelection | null;
  loadState: "idle" | "loading" | "error";
  trashCount: number;
  trashOpen: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onPrefetchNode: (node: WorkspaceNode) => void;
  onOpenNode: (node: WorkspaceNode) => void;
  onCreatePage: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder: (parentPath: string, name: string) => Promise<void>;
  onCreateDatabase: (parentPath: string, name: string) => Promise<void>;
  onRenameNode: (node: WorkspaceNode, nextName: string) => Promise<boolean>;
  onMoveNode: (node: WorkspaceNode, newParentPath: string) => Promise<boolean>;
  onDeleteNode: (node: WorkspaceNode) => Promise<boolean>;
  onOpenTrash: () => void;
}

type CreateKind = "page" | "folder" | "database";

const TREE_INDENT_PX = 20;
const TREE_ROW_PADDING_PX = 6;
const CREATE_ROW_PADDING_PX = 31;
const ENTITY_ICON_CLASS = "text-neutral-400";

interface CreateTarget {
  parentPath: string;
  kind: CreateKind;
}

interface FloatingMenu {
  node: WorkspaceNode | null;
  point: { x: number; y: number };
}

interface MoveDestination {
  path: string;
  name: string;
  kind: WorkspaceNode["kind"];
  depth: number;
  disabled: boolean;
  reason?: string;
}

export function Sidebar({
  workspaceName,
  tree,
  selection,
  loadState,
  trashCount,
  trashOpen,
  collapsed,
  onToggleCollapsed,
  onPrefetchNode,
  onOpenNode,
  onCreatePage,
  onCreateFolder,
  onCreateDatabase,
  onRenameNode,
  onMoveNode,
  onDeleteNode,
  onOpenTrash
}: SidebarProps): ReactElement {
  const initializedExpansion = useRef(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [floatingMenu, setFloatingMenu] = useState<FloatingMenu | null>(null);
  const [moveTarget, setMoveTarget] = useState<WorkspaceNode | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceNode | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!tree || initializedExpansion.current) {
      return;
    }

    initializedExpansion.current = true;
    setExpandedPaths(new Set((tree.children ?? []).filter(isContainerNode).map((node) => node.path)));
  }, [tree]);

  useEffect(() => {
    if (!selection) {
      return;
    }

    const paths = ancestorPaths(selection.nodePath);
    const openPaths = selection.openPath ? ancestorPaths(selection.openPath) : [];
    setExpandedPaths((current) => {
      const next = new Set(current);

      for (const path of [...paths, ...openPaths]) {
        next.add(path);
      }

      return next;
    });
  }, [selection]);

  const startCreate = useCallback((parentPath: string, kind: CreateKind) => {
    setFloatingMenu(null);
    setRenamingPath(null);
    setCreateTarget({ parentPath, kind });

    if (parentPath) {
      setExpandedPaths((current) => new Set(current).add(parentPath));
    }
  }, []);

  const startRename = useCallback((node: WorkspaceNode) => {
    setFloatingMenu(null);
    setCreateTarget(null);
    setRenamingPath(node.path);
  }, []);

  const requestDelete = useCallback((node: WorkspaceNode) => {
    setFloatingMenu(null);
    setCreateTarget(null);
    setRenamingPath(null);
    setDeleteTarget(node);
  }, []);

  const requestMove = useCallback((node: WorkspaceNode) => {
    setFloatingMenu(null);
    setCreateTarget(null);
    setRenamingPath(null);
    setMoveTarget(node);
  }, []);

  const confirmMove = useCallback(async (newParentPath: string) => {
    if (!moveTarget || moveBusy) {
      return;
    }

    setMoveBusy(true);

    try {
      await onMoveNode(moveTarget, newParentPath);
      setMoveTarget(null);
    } finally {
      setMoveBusy(false);
    }
  }, [moveBusy, moveTarget, onMoveNode]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleteBusy) {
      return;
    }

    setDeleteBusy(true);

    try {
      await onDeleteNode(deleteTarget);
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, deleteTarget, onDeleteNode]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }, []);

  const openRootMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;

    if (target?.closest("[data-sidebar-node='true']")) {
      return;
    }

    event.preventDefault();
    setFloatingMenu({ node: null, point: { x: event.clientX, y: event.clientY } });
  }, []);

  const openNodeMenu = useCallback((node: WorkspaceNode, event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setFloatingMenu({ node, point: { x: event.clientX, y: event.clientY } });
  }, []);

  return (
    <aside className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-r border-border bg-muted/35 text-foreground">
      <header className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
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
              <img src="/rumi-logo.svg" alt="" className="h-6 w-6 shrink-0" />
              <span className="truncate text-lg font-semibold">{workspaceName}</span>
            </button>
          </h1>
          <div className="flex shrink-0 gap-1">
            <RootCreateMenu onCreate={startCreate} />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onToggleCollapsed}
              title={collapsed ? "Open sidebar" : "Close sidebar"}
            >
              <SidebarSimple size={17} />
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-contain p-2" onContextMenu={openRootMenu}>
        {tree ? (
          <div className="space-y-0.5 pb-8">
            <CreateSlot
              target={createTarget}
              parentPath=""
              depth={0}
              onCancel={() => setCreateTarget(null)}
              onCreatePage={onCreatePage}
              onCreateFolder={onCreateFolder}
              onCreateDatabase={onCreateDatabase}
            />
            {(tree.children ?? []).map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={0}
                selection={selection}
                expandedPaths={expandedPaths}
                renamingPath={renamingPath}
                createTarget={createTarget}
                onPrefetchNode={onPrefetchNode}
                onOpenNode={onOpenNode}
                onToggleExpanded={toggleExpanded}
                onStartCreate={startCreate}
                onStartRename={startRename}
                onRenameNode={onRenameNode}
                onMoveNode={requestMove}
                onDeleteNode={requestDelete}
                onCancelRename={() => setRenamingPath(null)}
                onCancelCreate={() => setCreateTarget(null)}
                onCreatePage={onCreatePage}
                onCreateFolder={onCreateFolder}
                onCreateDatabase={onCreateDatabase}
                onOpenContextMenu={openNodeMenu}
              />
            ))}
          </div>
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {loadState === "loading" ? "Loading workspace..." : "No tree loaded"}
          </p>
        )}
      </div>

      <footer className="border-t border-border p-2">
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
            trashOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          aria-current={trashOpen ? "page" : undefined}
          onClick={onOpenTrash}
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
        <FloatingSidebarMenu
          menu={floatingMenu}
          onOpenChange={(open) => {
            if (!open) {
              setFloatingMenu(null);
            }
          }}
          onCreate={startCreate}
          onRename={startRename}
          onMove={requestMove}
          onDelete={requestDelete}
        />
      )}

      <MoveNodeDialog
        tree={tree}
        node={moveTarget}
        busy={moveBusy}
        onOpenChange={(open) => {
          if (!open && !moveBusy) {
            setMoveTarget(null);
          }
        }}
        onConfirm={confirmMove}
      />

      <DeleteNodeDialog
        node={deleteTarget}
        busy={deleteBusy}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={confirmDelete}
      />
    </aside>
  );
}

interface TreeNodeProps {
  node: WorkspaceNode;
  depth: number;
  selection: SidebarSelection | null;
  expandedPaths: Set<string>;
  renamingPath: string | null;
  createTarget: CreateTarget | null;
  onPrefetchNode: (node: WorkspaceNode) => void;
  onOpenNode: (node: WorkspaceNode) => void;
  onToggleExpanded: (path: string) => void;
  onStartCreate: (parentPath: string, kind: CreateKind) => void;
  onStartRename: (node: WorkspaceNode) => void;
  onRenameNode: (node: WorkspaceNode, nextName: string) => Promise<boolean>;
  onMoveNode: (node: WorkspaceNode) => void;
  onDeleteNode: (node: WorkspaceNode) => void;
  onCancelRename: () => void;
  onCancelCreate: () => void;
  onCreatePage: (parentPath: string, name: string) => Promise<void>;
  onCreateFolder: (parentPath: string, name: string) => Promise<void>;
  onCreateDatabase: (parentPath: string, name: string) => Promise<void>;
  onOpenContextMenu: (node: WorkspaceNode, event: MouseEvent<HTMLElement>) => void;
}

function TreeNode({
  node,
  depth,
  selection,
  expandedPaths,
  renamingPath,
  createTarget,
  onPrefetchNode,
  onOpenNode,
  onToggleExpanded,
  onStartCreate,
  onStartRename,
  onRenameNode,
  onMoveNode,
  onDeleteNode,
  onCancelRename,
  onCancelCreate,
  onCreatePage,
  onCreateFolder,
  onCreateDatabase,
  onOpenContextMenu
}: TreeNodeProps): ReactElement {
  const isContainer = isContainerNode(node);
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selection?.nodePath === node.path || selection?.openPath === node.path;
  const hasActiveDescendant = Boolean(
    selection && isContainer && (isPathInside(selection.nodePath, node.path) || isPathInside(selection.openPath, node.path))
  );
  const isRenaming = renamingPath === node.path;

  return (
    <div data-sidebar-node="true">
      <div
        className={cn(
          "rumi-sidebar-node group flex h-8 items-center gap-1 rounded-md pr-1 text-sm hover:bg-accent",
          isSelected && "bg-accent text-accent-foreground"
        )}
        style={{ paddingLeft: TREE_ROW_PADDING_PX }}
        onContextMenu={(event) => onOpenContextMenu(node, event)}
        aria-level={depth + 1}
      >
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
            onStartRename(node);
          }}
          aria-label={`Open ${displayName(node.name)}`}
        >
          <NodeIcon kind={node.kind} expanded={isExpanded} />
        </button>

        {isRenaming ? (
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
              onStartRename(node);
            }}
          >
            <span className={cn("truncate", isSelected && "font-semibold")}>{displayName(node.name)}</span>
          </button>
        )}

        <NodeMenu
          node={node}
          onCreate={onStartCreate}
          onRename={onStartRename}
          onMove={onMoveNode}
          onDelete={onDeleteNode}
        />
      </div>

      {isContainer && isExpanded && (
        <div
          className={cn(
            "border-l",
            hasActiveDescendant ? "border-primary/70" : "border-border"
          )}
          style={{ marginLeft: TREE_INDENT_PX }}
        >
          <CreateSlot
            target={createTarget}
            parentPath={node.path}
            depth={depth + 1}
            onCancel={onCancelCreate}
            onCreatePage={onCreatePage}
            onCreateFolder={onCreateFolder}
            onCreateDatabase={onCreateDatabase}
          />
          {(node.children ?? []).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selection={selection}
              expandedPaths={expandedPaths}
              renamingPath={renamingPath}
              createTarget={createTarget}
              onPrefetchNode={onPrefetchNode}
              onOpenNode={onOpenNode}
              onToggleExpanded={onToggleExpanded}
              onStartCreate={onStartCreate}
              onStartRename={onStartRename}
              onRenameNode={onRenameNode}
              onMoveNode={onMoveNode}
              onDeleteNode={onDeleteNode}
              onCancelRename={onCancelRename}
              onCancelCreate={onCancelCreate}
              onCreatePage={onCreatePage}
              onCreateFolder={onCreateFolder}
              onCreateDatabase={onCreateDatabase}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeMenu({
  node,
  onCreate,
  onRename,
  onMove,
  onDelete
}: {
  node: WorkspaceNode;
  onCreate: (parentPath: string, kind: CreateKind) => void;
  onRename: (node: WorkspaceNode) => void;
  onMove: (node: WorkspaceNode) => void;
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
        <NodeMenuItems
          node={node}
          onCreate={onCreate}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RootCreateMenu({ onCreate }: { onCreate: (parentPath: string, kind: CreateKind) => void }): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" title="Create">
          <Plus size={17} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onCreate("", "page")}>
          <NotePencil size={16} />
          New Page
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("", "folder")}>
          <FolderPlus size={16} />
          New Folder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("", "database")}>
          <Table size={16} />
          New Database
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FloatingSidebarMenu({
  menu,
  onOpenChange,
  onCreate,
  onRename,
  onMove,
  onDelete
}: {
  menu: FloatingMenu;
  onOpenChange: (open: boolean) => void;
  onCreate: (parentPath: string, kind: CreateKind) => void;
  onRename: (node: WorkspaceNode) => void;
  onMove: (node: WorkspaceNode) => void;
  onDelete: (node: WorkspaceNode) => void;
}): ReactElement {
  return (
    <DropdownMenu open onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="fixed h-px w-px opacity-0"
          style={{ left: menu.point.x, top: menu.point.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {menu.node ? (
          <NodeMenuItems
            node={menu.node}
            onCreate={onCreate}
            onRename={onRename}
            onMove={onMove}
            onDelete={onDelete}
          />
        ) : (
          <>
            <DropdownMenuItem onSelect={() => onCreate("", "page")}>
              <NotePencil size={16} />
              New Page
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCreate("", "folder")}>
              <FolderPlus size={16} />
              New Folder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCreate("", "database")}>
              <Table size={16} />
              New Database
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NodeMenuItems({
  node,
  onCreate,
  onRename,
  onMove,
  onDelete
}: {
  node: WorkspaceNode;
  onCreate: (parentPath: string, kind: CreateKind) => void;
  onRename: (node: WorkspaceNode) => void;
  onMove: (node: WorkspaceNode) => void;
  onDelete: (node: WorkspaceNode) => void;
}): ReactElement {
  const isContainer = isContainerNode(node);

  return (
    <>
      {isContainer && node.kind !== "database" && (
        <>
          <DropdownMenuItem onSelect={() => onCreate(node.path, "page")}>
            <NotePencil size={16} />
            New Page
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCreate(node.path, "folder")}>
            <FolderPlus size={16} />
            New Folder
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCreate(node.path, "database")}>
            <Table size={16} />
            New Database
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onSelect={() => onRename(node)}>
        <PencilSimple size={16} />
        Rename
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onMove(node)}>
        <ArrowRight size={16} />
        Move
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(node)}>
        <Trash size={16} />
        Move to Trash
      </DropdownMenuItem>
    </>
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

export function DeleteNodeDialog({
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
  return (
    <AlertDialog open={Boolean(node)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
              <WarningCircle size={18} weight="fill" />
            </span>
            <AlertDialogTitle>Move item to Trash</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {node ? (
              <>
                Move <span className="font-medium text-foreground">{node.path}</span> to Trash? You can restore it later.
              </>
            ) : (
              "Move this item to Trash? You can restore it later."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancelButton disabled={busy}>Cancel</AlertDialogCancelButton>
          <AlertDialogActionButton
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? "Moving" : "Move to Trash"}
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
  target: CreateTarget | null;
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
      className="flex h-8 items-center gap-1 pr-1"
      style={{ paddingLeft: CREATE_ROW_PADDING_PX }}
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

function isContainerNode(node: WorkspaceNode): boolean {
  return node.kind === "workspace" || node.kind === "folder" || node.kind === "database";
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

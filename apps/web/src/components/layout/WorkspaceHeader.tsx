import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import type { WorkspaceNode } from "@rumi/contracts";
import { findWorkspaceNode } from "../../lib/lastOpenedPage";
import { cn } from "../../lib/utils";
import type { SidebarSelection } from "../sidebar/Sidebar";
import { DeleteNodeDialog, MoveNodeDialog } from "../sidebar/Sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

interface WorkspaceHeaderProps {
  workspaceName: string;
  tree: WorkspaceNode | null;
  selection: SidebarSelection | null;
  trashOpen: boolean;
  wide: boolean;
  hasOpenPage: boolean;
  onNavigate: (node: WorkspaceNode) => void;
  onToggleSearch: () => void;
  onMoveNode: (node: WorkspaceNode, newParentPath: string) => Promise<boolean>;
  onMoveToTrash: (node: WorkspaceNode) => Promise<boolean>;
  onSeeRevisions: () => void;
}

export interface WorkspaceBreadcrumb {
  key: string;
  label: string;
  node: WorkspaceNode | null;
  current: boolean;
}

export function WorkspaceHeader({
  workspaceName,
  tree,
  selection,
  trashOpen,
  wide,
  hasOpenPage,
  onNavigate,
  onToggleSearch,
  onMoveNode,
  onMoveToTrash,
  onSeeRevisions
}: WorkspaceHeaderProps): ReactElement {
  const breadcrumbs = useMemo(
    () => workspaceBreadcrumbs(workspaceName, tree, selection, trashOpen),
    [selection, trashOpen, tree, workspaceName]
  );
  const activeNode = selection && tree ? findWorkspaceNode(tree, selection.nodePath) : null;
  const canManageActiveNode = Boolean(activeNode && activeNode.kind !== "workspace" && !trashOpen);
  const [moveTarget, setMoveTarget] = useState<WorkspaceNode | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [trashTarget, setTrashTarget] = useState<WorkspaceNode | null>(null);
  const [trashBusy, setTrashBusy] = useState(false);

  const confirmMove = async (newParentPath: string) => {
    if (!moveTarget || moveBusy) return;
    setMoveBusy(true);
    try {
      if (await onMoveNode(moveTarget, newParentPath)) setMoveTarget(null);
    } finally {
      setMoveBusy(false);
    }
  };

  const confirmTrash = async () => {
    if (!trashTarget || trashBusy) return;
    setTrashBusy(true);
    try {
      if (await onMoveToTrash(trashTarget)) setTrashTarget(null);
    } finally {
      setTrashBusy(false);
    }
  };

  return (
    <header className="min-h-14 shrink-0 py-2.5">
      <div
        className={cn(
          "mx-auto w-full px-6 sm:px-10 lg:px-12",
          wide ? "max-w-[1120px]" : "max-w-[820px]"
        )}
      >
        <div className="relative">
          <div
            data-rumi-address-bar=""
            className="flex h-9 w-full min-w-0 items-center gap-1 rounded-lg bg-neutral-100 px-2 text-sm text-muted-foreground transition-colors hover:bg-neutral-200/70"
            onClick={(event) => {
              if (event.target === event.currentTarget) onToggleSearch();
            }}
          >
            <nav
              aria-label="Current location"
              className="flex min-w-0 flex-1 items-center overflow-hidden"
              onClick={(event) => {
                if (event.target === event.currentTarget) onToggleSearch();
              }}
            >
              <ol className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">
                {breadcrumbs.map((breadcrumb, index) => (
                  <li key={breadcrumb.key} className="flex min-w-0 items-center">
                    {index > 0 && <span className="mx-1 text-neutral-400">/</span>}
                    {breadcrumb.node ? (
                      <button
                        type="button"
                        className={cn(
                          "min-w-0 truncate rounded px-0.5 py-1 transition-colors hover:text-foreground hover:underline",
                          breadcrumb.current && "font-medium text-foreground"
                        )}
                        aria-current={breadcrumb.current ? "page" : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          onNavigate(breadcrumb.node!);
                        }}
                      >
                        {breadcrumb.label}
                      </button>
                    ) : (
                      <span
                        className={cn("min-w-0 truncate px-0.5 py-1", breadcrumb.current && "font-medium text-foreground")}
                        aria-current={breadcrumb.current ? "page" : undefined}
                      >
                        {breadcrumb.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <button
              type="button"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-neutral-500 transition-colors hover:bg-white/80 hover:text-foreground"
              aria-label="Toggle search (Command K)"
              title="Search (Command K)"
              onClick={(event) => {
                event.stopPropagation();
                onToggleSearch();
              }}
            >
              <MagnifyingGlass size={15} />
              <kbd className="rounded border border-neutral-300 bg-white/80 px-1.5 py-0.5 font-sans text-[11px] leading-none shadow-sm">
                ⌘ K
              </kbd>
            </button>

          </div>

          {(canManageActiveNode || hasOpenPage) && (
            <div
              data-rumi-header-actions=""
              className="absolute left-full top-1/2 -translate-y-1/2 sm:ml-2"
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-foreground data-[state=open]:bg-neutral-100 sm:h-7 sm:w-7"
                    aria-label="File actions"
                    title="File actions"
                  >
                    <DotsThree size={18} weight="bold" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canManageActiveNode && activeNode && (
                    <>
                      <DropdownMenuItem onSelect={() => setMoveTarget(activeNode)}>
                        <ArrowRight size={16} />
                        Move file
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setTrashTarget(activeNode)}
                      >
                        <Trash size={16} />
                        Move to Trash
                      </DropdownMenuItem>
                    </>
                  )}
                  {canManageActiveNode && hasOpenPage && <DropdownMenuSeparator />}
                  {hasOpenPage && (
                    <DropdownMenuItem onSelect={onSeeRevisions}>
                      <ClockCounterClockwise size={16} />
                      See revisions
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      <MoveNodeDialog
        tree={tree}
        node={moveTarget}
        busy={moveBusy}
        onOpenChange={(open) => {
          if (!open && !moveBusy) setMoveTarget(null);
        }}
        onConfirm={confirmMove}
      />

      <DeleteNodeDialog
        node={trashTarget}
        busy={trashBusy}
        onOpenChange={(open) => {
          if (!open && !trashBusy) setTrashTarget(null);
        }}
        onConfirm={confirmTrash}
      />
    </header>
  );
}

export function workspaceBreadcrumbs(
  workspaceName: string,
  tree: WorkspaceNode | null,
  selection: SidebarSelection | null,
  trashOpen: boolean
): WorkspaceBreadcrumb[] {
  const breadcrumbs: WorkspaceBreadcrumb[] = [{
    key: "workspace-root",
    label: workspaceName,
    node: tree,
    current: (!selection || selection.nodePath === "") && !trashOpen
  }];

  if (trashOpen) {
    breadcrumbs.push({ key: "trash", label: "Trash", node: null, current: true });
    return breadcrumbs;
  }

  if (!selection || !tree) return breadcrumbs;
  const parts = selection.nodePath.split("/").filter(Boolean);

  for (let index = 0; index < parts.length; index += 1) {
    const path = parts.slice(0, index + 1).join("/");
    const node = findWorkspaceNode(tree, path);
    if (!node) continue;
    breadcrumbs.push({
      key: node.path,
      label: displayNodeName(node.name),
      node,
      current: node.path === selection.nodePath
    });
  }

  return breadcrumbs;
}

function displayNodeName(name: string): string {
  return name.replace(/\.(?:index|db)\.md$|\.md$/iu, "");
}

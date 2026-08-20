import { useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { LinkSimple } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import type { WorkspaceNode } from "@rumi/contracts";
import { findWorkspaceNode } from "../../lib/lastOpenedPage";
import type { WorkspaceSystemView } from "../../lib/workspaceRoute";
import { cn } from "../../lib/utils";
import type { SidebarSelection } from "../sidebar/Sidebar";
import { MoveNodeDialog } from "../sidebar/Sidebar";
import { EDITOR_ADDRESS_BAR_CONTAINER_CLASS } from "./EditorPageLayout";
import { EditorHeaderIconButton } from "./EditorHeaderIconButton";
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
  systemView: WorkspaceSystemView | null;
  hasOpenPage: boolean;
  onNavigate: (node: WorkspaceNode) => void;
  onToggleSearch: () => void;
  onMoveNode: (node: WorkspaceNode, newParentPath: string) => Promise<boolean>;
  onMoveToTrash: (node: WorkspaceNode) => Promise<boolean>;
  onCopyUrl: () => void;
  onCopyRelativePath: () => void;
  copyUrlShortcut: string;
  copyRelativePathShortcut: string;
  onSeeRevisions: () => void;
  leadingControls: ReactNode;
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
  systemView,
  hasOpenPage,
  onNavigate,
  onToggleSearch,
  onMoveNode,
  onMoveToTrash,
  onCopyUrl,
  onCopyRelativePath,
  copyUrlShortcut,
  copyRelativePathShortcut,
  onSeeRevisions,
  leadingControls
}: WorkspaceHeaderProps): ReactElement {
  const breadcrumbs = useMemo(
    () => workspaceBreadcrumbs(workspaceName, tree, selection, systemView),
    [selection, systemView, tree, workspaceName]
  );
  const activeNode = selection && tree ? findWorkspaceNode(tree, selection.nodePath) : null;
  const canManageActiveNode = Boolean(activeNode && activeNode.kind !== "workspace" && !systemView);
  const [moveTarget, setMoveTarget] = useState<WorkspaceNode | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);

  const confirmMove = async (newParentPath: string) => {
    if (!moveTarget || moveBusy) return;
    setMoveBusy(true);
    try {
      if (await onMoveNode(moveTarget, newParentPath)) setMoveTarget(null);
    } finally {
      setMoveBusy(false);
    }
  };

  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-20 min-h-14 bg-background py-2.5"
      data-rumi-workspace-header=""
    >
      <div className="pointer-events-auto grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center px-3">
        <div className="flex items-center gap-1" data-rumi-header-sidebar-controls="">
          {leadingControls}
        </div>

        <div className={`${EDITOR_ADDRESS_BAR_CONTAINER_CLASS} min-w-0`}>
          <div
            data-rumi-address-bar=""
            className="flex h-9 w-full min-w-0 items-center gap-1 rounded-lg bg-surface-subtle px-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
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
                    {index > 0 && <span className="mx-1 text-muted-foreground">/</span>}
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
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
              aria-label="Toggle search (Command K)"
              title="Search (Command K)"
              onClick={(event) => {
                event.stopPropagation();
                onToggleSearch();
              }}
            >
              <MagnifyingGlass size={15} />
              <kbd className="rounded border border-input bg-background/80 px-1.5 py-0.5 font-sans text-[11px] leading-none shadow-sm">
                ⌘ K
              </kbd>
            </button>
          </div>

        </div>

        <div className="flex justify-end" data-rumi-header-actions="">
          {(canManageActiveNode || hasOpenPage) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <EditorHeaderIconButton
                    aria-label="File actions"
                    title="File actions"
                  >
                    <DotsThree size={18} weight="bold" />
                  </EditorHeaderIconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {hasOpenPage && (
                    <>
                      <DropdownMenuItem onSelect={onCopyUrl}>
                        <LinkSimple size={16} />
                        Copy URL
                        <span className="ml-auto pl-4 text-xs text-muted-foreground" aria-hidden="true">
                          {copyUrlShortcut}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={onCopyRelativePath}>
                        <Copy size={16} />
                        Copy relative path
                        <span className="ml-auto pl-4 text-xs text-muted-foreground" aria-hidden="true">
                          {copyRelativePathShortcut}
                        </span>
                      </DropdownMenuItem>
                    </>
                  )}
                  {hasOpenPage && canManageActiveNode && <DropdownMenuSeparator />}
                  {canManageActiveNode && activeNode && (
                    <>
                      <DropdownMenuItem onSelect={() => setMoveTarget(activeNode)}>
                        <ArrowRight size={16} />
                        Move file
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => void onMoveToTrash(activeNode)}
                      >
                        <Trash size={16} />
                        Move to Trash
                      </DropdownMenuItem>
                    </>
                  )}
                  {(canManageActiveNode || hasOpenPage) && hasOpenPage && <DropdownMenuSeparator />}
                  {hasOpenPage && (
                    <DropdownMenuItem onSelect={onSeeRevisions}>
                      <ClockCounterClockwise size={16} />
                      See revisions
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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

    </header>
  );
}

export function workspaceBreadcrumbs(
  workspaceName: string,
  tree: WorkspaceNode | null,
  selection: SidebarSelection | null,
  systemView: WorkspaceSystemView | null
): WorkspaceBreadcrumb[] {
  const breadcrumbs: WorkspaceBreadcrumb[] = [{
    key: "workspace-root",
    label: workspaceName,
    node: tree,
    current: (!selection || selection.nodePath === "") && !systemView
  }];

  if (systemView) {
    const label = systemView === "settings" ? "Settings" : "Trash";
    breadcrumbs.push({ key: systemView, label, node: null, current: true });
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

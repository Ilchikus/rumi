import { useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import type { WorkspaceNode } from "@rumi/contracts";
import { findWorkspaceNode } from "../../lib/lastOpenedPage";
import { appShortcutPlatform } from "../../lib/appShortcuts";
import { isSecondaryContextGesture } from "../../lib/appBrowserInteractions";
import type { PageCopyAction } from "../../lib/pageCopyActions";
import type { WorkspaceSystemView } from "../../lib/workspaceRoute";
import { cn } from "../../lib/utils";
import type { SidebarSelection } from "../sidebar/Sidebar";
import {
  FloatingWorkspaceItemMenu,
  WorkspaceItemMenuItems,
  workspaceItemActionModel
} from "../workspace/WorkspaceItemMenu";
import type {
  FloatingWorkspaceItemMenuState,
  WorkspaceItemCreateKind
} from "../workspace/WorkspaceItemMenu";
import { EDITOR_ADDRESS_BAR_CONTAINER_CLASS } from "./EditorPageLayout";
import { EditorHeaderIconButton } from "./EditorHeaderIconButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../ui/dropdown-menu";

interface WorkspaceHeaderProps {
  workspaceName: string;
  tree: WorkspaceNode | null;
  selection: SidebarSelection | null;
  systemView: WorkspaceSystemView | null;
  onNavigate: (node: WorkspaceNode) => void;
  onToggleSearch: () => void;
  onCreateNode: (parentPath: string, kind: WorkspaceItemCreateKind) => void;
  onCreateDefault: (parentPath: string, kind: WorkspaceItemCreateKind) => Promise<void>;
  onCopyNode: (node: WorkspaceNode, action: PageCopyAction) => void;
  onRenameNode: (node: WorkspaceNode) => void;
  onMoveNode: (node: WorkspaceNode) => void;
  onConvertNode: (node: WorkspaceNode) => void;
  pinnedPaths: readonly string[];
  onPinnedChange: (node: WorkspaceNode, pinned: boolean) => void;
  onSeeRevisions: (node: WorkspaceNode) => void;
  onMoveToTrash: (node: WorkspaceNode) => Promise<boolean>;
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
  onNavigate,
  onToggleSearch,
  onCreateNode,
  onCreateDefault,
  onCopyNode,
  onRenameNode,
  onMoveNode,
  onConvertNode,
  pinnedPaths,
  onPinnedChange,
  onSeeRevisions,
  onMoveToTrash,
  leadingControls
}: WorkspaceHeaderProps): ReactElement {
  const breadcrumbs = useMemo(
    () => workspaceBreadcrumbs(workspaceName, tree, selection, systemView),
    [selection, systemView, tree, workspaceName]
  );
  const activeNode = selection && tree ? findWorkspaceNode(tree, selection.nodePath) : null;
  const activeNodePinned = Boolean(activeNode && pinnedPaths.includes(activeNode.path));
  const hasActiveNodeActions = Boolean(
    !systemView && workspaceItemActionModel(activeNode, { pinned: activeNodePinned }).length > 0
  );
  const [breadcrumbMenu, setBreadcrumbMenu] = useState<FloatingWorkspaceItemMenuState | null>(null);
  const shortcutPlatform = appShortcutPlatform();

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
                          if (isSecondaryContextGesture(event.nativeEvent, shortcutPlatform)) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }
                          event.stopPropagation();
                          onNavigate(breadcrumb.node!);
                        }}
                        onMouseDown={(event) => {
                          if (!isSecondaryContextGesture(event.nativeEvent, shortcutPlatform)) return;
                          event.preventDefault();
                          event.stopPropagation();
                          setBreadcrumbMenu({
                            node: breadcrumb.node!,
                            point: { x: event.clientX, y: event.clientY },
                            returnFocus: event.currentTarget
                          });
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setBreadcrumbMenu({
                            node: breadcrumb.node!,
                            point: { x: event.clientX, y: event.clientY },
                            returnFocus: event.currentTarget
                          });
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
          {hasActiveNodeActions && activeNode && (
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
                  <WorkspaceItemMenuItems
                    node={activeNode}
                    pinned={activeNodePinned}
                    onCreate={onCreateNode}
                    onCreateDefault={onCreateDefault}
                    onCopy={onCopyNode}
                    onRename={onRenameNode}
                    onMove={onMoveNode}
                    onConvert={onConvertNode}
                    onPinnedChange={onPinnedChange}
                    onSeeRevisions={onSeeRevisions}
                    onDelete={(node) => void onMoveToTrash(node)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
          )}
        </div>
      </div>

      {breadcrumbMenu && (
        <FloatingWorkspaceItemMenu
          menu={breadcrumbMenu}
          onOpenChange={(open) => {
            if (!open) setBreadcrumbMenu(null);
          }}
          onCreate={onCreateNode}
          onCreateDefault={onCreateDefault}
          onCopy={onCopyNode}
          pinned={pinnedPaths.includes(breadcrumbMenu.node.path)}
          onRename={onRenameNode}
          onMove={onMoveNode}
          onConvert={onConvertNode}
          onPinnedChange={onPinnedChange}
          onSeeRevisions={onSeeRevisions}
          onDelete={(node) => void onMoveToTrash(node)}
        />
      )}

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
    const label = systemView === "settings"
      ? "Settings"
      : systemView === "uploads"
        ? "Uploads"
        : "Trash";
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

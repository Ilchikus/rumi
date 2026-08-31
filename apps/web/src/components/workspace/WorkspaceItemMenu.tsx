import { Fragment, useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { FolderPlus } from "@phosphor-icons/react/dist/csr/FolderPlus";
import { LinkSimple } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { NotePencil } from "@phosphor-icons/react/dist/csr/NotePencil";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { PushPin } from "@phosphor-icons/react/dist/csr/PushPin";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import type { WorkspaceNode } from "@rumi/contracts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import {
  appShortcutPlatform,
  hasPrimaryModifier
} from "../../lib/appShortcuts";
import type { PageCopyAction } from "../../lib/pageCopyActions";
import { isPinnableWorkspaceNode } from "../../lib/pinnedItems";

export type WorkspaceItemCreateKind = "page" | "folder" | "database";

export type WorkspaceItemActionId =
  | "new-page"
  | "new-folder"
  | "new-database"
  | "copy-url"
  | "copy-relative-path"
  | "pin"
  | "unpin"
  | "rename"
  | "move"
  | "convert-to-database"
  | "convert-to-folder"
  | "see-revisions"
  | "move-to-trash";

type WorkspaceItemActionGroup =
  | "create"
  | "copy"
  | "pin"
  | "mutate"
  | "history"
  | "destructive";

export interface WorkspaceItemAction {
  id: WorkspaceItemActionId;
  label: string;
  group: WorkspaceItemActionGroup;
}

export interface WorkspaceItemActionCallbacks {
  onCreate: (parentPath: string, kind: WorkspaceItemCreateKind) => void;
  onCreateDefault: (parentPath: string, kind: WorkspaceItemCreateKind) => Promise<void>;
  onCopy: (node: WorkspaceNode, action: PageCopyAction) => void;
  onRename: (node: WorkspaceNode) => void;
  onMove: (node: WorkspaceNode) => void;
  onConvert: (node: WorkspaceNode) => void;
  onPinnedChange: (node: WorkspaceNode, pinned: boolean) => void;
  onSeeRevisions: (node: WorkspaceNode) => void;
  onDelete: (node: WorkspaceNode) => void;
}

export interface FloatingWorkspaceItemMenuState {
  node: WorkspaceNode;
  point: { x: number; y: number };
  returnFocus: HTMLElement | null;
}

const ACTION_PRESENTATION: Record<WorkspaceItemActionId, Omit<WorkspaceItemAction, "id">> = {
  "new-page": { label: "New Page", group: "create" },
  "new-folder": { label: "New Folder", group: "create" },
  "new-database": { label: "New Database", group: "create" },
  "copy-url": { label: "Copy URL", group: "copy" },
  "copy-relative-path": { label: "Copy relative path", group: "copy" },
  pin: { label: "Pin", group: "pin" },
  unpin: { label: "Unpin", group: "pin" },
  rename: { label: "Rename", group: "mutate" },
  move: { label: "Move", group: "mutate" },
  "convert-to-database": { label: "Convert to database", group: "mutate" },
  "convert-to-folder": { label: "Convert to folder", group: "mutate" },
  "see-revisions": { label: "See revisions", group: "history" },
  "move-to-trash": { label: "Move to Trash", group: "destructive" }
};

export function workspaceItemActionModel(
  node: WorkspaceNode | null,
  state: { pinned?: boolean } = {}
): WorkspaceItemAction[] {
  if (!node || node.kind === "asset" || node.kind === "file") return [];

  const ids: WorkspaceItemActionId[] = [];
  const createKinds = workspaceItemCreateKinds(node.kind);
  ids.push(...createKinds.map((kind): WorkspaceItemActionId => `new-${kind}`));

  const hasCopyTarget = node.kind !== "workspace" || Boolean(node.companionPath);
  if (hasCopyTarget) ids.push("copy-url", "copy-relative-path");

  if (node.kind !== "workspace") {
    if (isPinnableWorkspaceNode(node)) ids.push(state.pinned ? "unpin" : "pin");
    ids.push("rename", "move");
    if (node.kind === "folder") ids.push("convert-to-database");
    if (node.kind === "database") ids.push("convert-to-folder");
    if (node.kind === "page" || node.companionPath) ids.push("see-revisions");
    ids.push("move-to-trash");
  }

  return ids.map((id) => ({ id, ...ACTION_PRESENTATION[id] }));
}

export function workspaceItemCreateKinds(
  kind: WorkspaceNode["kind"]
): WorkspaceItemCreateKind[] {
  if (kind === "workspace" || kind === "folder") {
    return ["page", "folder", "database"];
  }
  if (kind === "database") return ["page"];
  return [];
}

export function shouldCreatePageImmediately(
  kind: WorkspaceItemCreateKind,
  event: Parameters<typeof hasPrimaryModifier>[0],
  platform: Parameters<typeof hasPrimaryModifier>[1]
): boolean {
  return kind === "page" && hasPrimaryModifier(event, platform);
}

export function WorkspaceItemMenuItems({
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
}: { node: WorkspaceNode; pinned: boolean } & WorkspaceItemActionCallbacks): ReactElement {
  const actions = workspaceItemActionModel(node, { pinned });
  const platform = appShortcutPlatform();
  const immediateCreationRef = useRef<WorkspaceItemCreateKind | null>(null);

  return (
    <>
      {actions.map((action, index) => {
        const previousAction = actions[index - 1];
        const separator = previousAction && previousAction.group !== action.group
          ? <DropdownMenuSeparator key={`${previousAction.group}-${action.group}`} />
          : null;
        const createKind = createKindForAction(action.id);

        return (
          <Fragment key={action.id}>
            {separator}
            <DropdownMenuItem
              className={action.id === "move-to-trash"
                ? "text-destructive focus:text-destructive"
                : undefined}
              onPointerDown={createKind ? (event) => {
                immediateCreationRef.current = shouldCreatePageImmediately(
                  createKind,
                  event,
                  platform
                ) ? createKind : null;
              } : undefined}
              onKeyDown={createKind ? (event) => {
                immediateCreationRef.current = event.key === "Enter" &&
                  shouldCreatePageImmediately(createKind, event, platform)
                  ? createKind
                  : null;
              } : undefined}
              onSelect={() => {
                if (createKind) {
                  if (immediateCreationRef.current === createKind) {
                    immediateCreationRef.current = null;
                    void onCreateDefault(node.path, createKind).catch(() => undefined);
                    return;
                  }
                  immediateCreationRef.current = null;
                  onCreate(node.path, createKind);
                  return;
                }

                activateWorkspaceItemAction(action.id, node, {
                  onCopy,
                  onRename,
                  onMove,
                  onConvert,
                  onPinnedChange,
                  onSeeRevisions,
                  onDelete
                });
              }}
            >
              <WorkspaceItemActionIcon action={action.id} />
              {action.label}
            </DropdownMenuItem>
          </Fragment>
        );
      })}
    </>
  );
}

export function FloatingWorkspaceItemMenu({
  menu,
  onOpenChange,
  ...callbacks
}: {
  menu: FloatingWorkspaceItemMenuState;
  onOpenChange: (open: boolean) => void;
  pinned: boolean;
} & WorkspaceItemActionCallbacks): ReactElement {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      if (contentRef.current) focusFirstWorkspaceItemMenuAction(contentRef.current);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [menu]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      const returnFocus = menu.returnFocus;
      window.setTimeout(() => restoreWorkspaceItemMenuFocus(returnFocus), 0);
    }
    onOpenChange(open);
  };

  return (
    <DropdownMenu open onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="fixed h-px w-px opacity-0"
          style={{ left: menu.point.x, top: menu.point.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contentRef}
        align="start"
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          event.preventDefault();
          moveWorkspaceItemMenuFocus(
            event.currentTarget,
            event.key === "ArrowDown" ? "next" : "previous"
          );
        }}
        onCloseAutoFocus={(event) => {
          if (!restoreWorkspaceItemMenuFocus(menu.returnFocus)) return;
          event.preventDefault();
        }}
      >
        <WorkspaceItemMenuItems node={menu.node} {...callbacks} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function focusFirstWorkspaceItemMenuAction(menu: HTMLElement): HTMLElement | null {
  const firstItem = enabledWorkspaceItemMenuActions(menu)[0] ?? null;
  firstItem?.focus({ preventScroll: true });
  return firstItem;
}

export function moveWorkspaceItemMenuFocus(
  menu: HTMLElement,
  direction: "next" | "previous"
): HTMLElement | null {
  const items = enabledWorkspaceItemMenuActions(menu);
  if (items.length === 0) return null;
  const activeIndex = items.indexOf(document.activeElement as HTMLElement);
  const offset = direction === "next" ? 1 : -1;
  const nextIndex = activeIndex < 0
    ? direction === "next" ? 0 : items.length - 1
    : (activeIndex + offset + items.length) % items.length;
  const item = items[nextIndex] ?? null;
  item?.focus({ preventScroll: true });
  return item;
}

export function restoreWorkspaceItemMenuFocus(element: HTMLElement | null): boolean {
  if (!element?.isConnected) return false;
  element.focus({ preventScroll: true });
  return true;
}

function enabledWorkspaceItemMenuActions(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(
    '[role="menuitem"]:not([data-disabled])'
  ));
}

function createKindForAction(
  action: WorkspaceItemActionId
): WorkspaceItemCreateKind | null {
  if (action === "new-page") return "page";
  if (action === "new-folder") return "folder";
  if (action === "new-database") return "database";
  return null;
}

function activateWorkspaceItemAction(
  action: WorkspaceItemActionId,
  node: WorkspaceNode,
  callbacks: Pick<
    WorkspaceItemActionCallbacks,
    | "onCopy"
    | "onRename"
    | "onMove"
    | "onConvert"
    | "onPinnedChange"
    | "onSeeRevisions"
    | "onDelete"
  >
): void {
  if (action === "copy-url") callbacks.onCopy(node, "url");
  if (action === "copy-relative-path") callbacks.onCopy(node, "relative-path");
  if (action === "rename") callbacks.onRename(node);
  if (action === "move") callbacks.onMove(node);
  if (action === "pin") callbacks.onPinnedChange(node, true);
  if (action === "unpin") callbacks.onPinnedChange(node, false);
  if (action === "convert-to-database" || action === "convert-to-folder") {
    callbacks.onConvert(node);
  }
  if (action === "see-revisions") callbacks.onSeeRevisions(node);
  if (action === "move-to-trash") callbacks.onDelete(node);
}

function WorkspaceItemActionIcon({
  action
}: { action: WorkspaceItemActionId }): ReactElement {
  if (action === "new-page") return <NotePencil size={16} />;
  if (action === "new-folder") return <FolderPlus size={16} />;
  if (action === "new-database" || action === "convert-to-database") {
    return <Table size={16} />;
  }
  if (action === "copy-url") return <LinkSimple size={16} />;
  if (action === "copy-relative-path") return <Copy size={16} />;
  if (action === "pin" || action === "unpin") {
    return <PushPin size={16} />;
  }
  if (action === "rename") return <PencilSimple size={16} />;
  if (action === "move") return <ArrowRight size={16} />;
  if (action === "convert-to-folder") return <Folder size={16} />;
  if (action === "see-revisions") return <ClockCounterClockwise size={16} />;
  return <Trash size={16} />;
}

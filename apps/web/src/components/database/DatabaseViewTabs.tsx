import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import type { DatabaseView } from "@rumi/contracts";
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

export interface DatabaseViewTabsProps {
  views: readonly DatabaseView[];
  activeViewId: string;
  busy?: boolean;
  onSelect: (viewId: string) => void;
  onCreate: () => void;
  onRename: (viewId: string, name: string) => Promise<boolean>;
  onDuplicate: (viewId: string) => void;
  onDelete: (viewId: string) => void;
}

export function DatabaseViewTabs({
  views,
  activeViewId,
  busy = false,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete
}: DatabaseViewTabsProps): ReactElement {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % views.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + views.length) % views.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = views.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const view = views[nextIndex];
    if (!view) return;
    onSelect(view.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className="rumi-database-view-tabs flex h-10 min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden"
      data-database-view-tabs="true"
    >
      <div
        className="flex h-10 shrink-0 items-center gap-2"
        role="tablist"
        aria-label="Database views"
      >
        {views.map((view, index) => {
          const active = view.id === activeViewId;
          return (
            <div
              key={view.id}
              className={cn(
                "group/view-tab relative flex h-10 shrink-0 items-center rounded-full border",
                active
                  ? "border-transparent bg-neutral-100"
                  : "border-border bg-white hover:bg-neutral-50"
              )}
              data-database-view-tab-active={active ? "true" : undefined}
              data-database-view-tab-index={index}
            >
              <button
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className={cn(
                  "flex h-full min-w-24 max-w-52 items-center gap-1.5 rounded-full px-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active
                    ? "font-semibold text-neutral-900"
                    : "font-medium text-neutral-500 hover:text-neutral-800"
                )}
                onClick={() => onSelect(view.id)}
                onKeyDown={(event) => moveFocus(event, index)}
              >
                <Table size={14} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{view.name}</span>
              </button>
              <DatabaseViewTabMenu
                view={view}
                canDelete={views.length > 1}
                busy={busy}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-transparent text-neutral-500 outline-none hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label="Add database view"
        title="Add table view"
        disabled={busy}
        onClick={onCreate}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function DatabaseViewTabMenu({
  view,
  canDelete,
  busy,
  onRename,
  onDuplicate,
  onDelete
}: {
  view: DatabaseView;
  canDelete: boolean;
  busy: boolean;
  onRename: (viewId: string, name: string) => Promise<boolean>;
  onDuplicate: (viewId: string) => void;
  onDelete: (viewId: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(view.name);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");

  useEffect(() => {
    if (!open) {
      setDraft(view.name);
      setRenameError("");
    }
  }, [open, view.name]);

  const commit = async () => {
    const name = draft.trim();
    if (!name || renaming) return;
    if (name === view.name) {
      setOpen(false);
      return;
    }
    setRenaming(true);
    setRenameError("");
    try {
      if (await onRename(view.id, name)) setOpen(false);
      else setRenameError("View could not be renamed.");
    } catch {
      setRenameError("View could not be renamed.");
    } finally {
      setRenaming(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 outline-none hover:bg-background/80 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring group-hover/view-tab:opacity-100"
          aria-label={`Manage ${view.name} view`}
          onClick={(event) => event.stopPropagation()}
        >
          <DotsThree size={14} weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="px-1 pb-1">
          <label className="mb-1 block px-1 text-[11px] font-medium text-muted-foreground">
            View name
          </label>
          <input
            value={draft}
            disabled={busy || renaming}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            aria-label={`Rename ${view.name} view`}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setRenameError("");
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                void commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
            }}
          />
          {renameError && (
            <p className="mt-1 px-1 text-[11px] text-destructive" role="alert">
              {renameError}
            </p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => onDuplicate(view.id)}
        >
          <Copy size={15} aria-hidden="true" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy || !canDelete}
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(view.id)}
        >
          <Trash size={15} aria-hidden="true" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

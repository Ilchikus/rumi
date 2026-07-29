import type { ReactElement } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { File } from "@phosphor-icons/react/dist/csr/File";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { Image } from "@phosphor-icons/react/dist/csr/Image";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import type { TrashItem, TrashItemKind } from "@rumi/contracts";
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
import { EditorPageLayout } from "../layout/EditorPageLayout";

interface TrashViewProps {
  items: TrashItem[];
  loadState: "idle" | "loading" | "error";
  restoringId: string | null;
  deletingId: string | null;
  onOpen: (item: TrashItem) => void;
  onRestore: (item: TrashItem, openAfterRestore?: boolean) => Promise<void>;
  onDeleteForever: (item: TrashItem) => void;
}

export function TrashView({
  items,
  loadState,
  restoringId,
  deletingId,
  onOpen,
  onRestore,
  onDeleteForever
}: TrashViewProps): ReactElement {
  return (
    <EditorPageLayout title="Trash">
      <p className="text-sm text-muted-foreground">
        Deleted items stay in this workspace and can be restored. Their original location is shown below.
      </p>

      <div className="mt-8">
        {loadState === "loading" && items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Loading Trash…</p>
        ) : loadState === "error" && items.length === 0 ? (
          <p className="py-6 text-sm text-destructive">Trash could not be loaded.</p>
        ) : items.length === 0 ? (
          <div className="grid place-items-center px-6 py-16 text-center">
            <Trash size={28} className="text-muted-foreground" />
            <p className="mt-3 font-medium">Trash is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Items you delete will appear here.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="group min-w-0 flex-1 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                  disabled={!isViewableItem(item.kind)}
                  onClick={() => onOpen(item)}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className={`truncate text-sm font-medium ${
                        isViewableItem(item.kind)
                          ? "group-hover:underline group-focus-visible:underline"
                          : ""
                      }`}>
                        {item.name}
                      </p>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <TrashItemIcon kind={item.kind} />
                        {kindLabel(item.kind)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.originalPath}>
                      From {item.originalPath} · {formatDeletedAt(item.deletedAt)}
                    </p>
                  </div>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={
                    isViewableItem(item.kind)
                      ? "Restore · Command/Control-click to restore and open"
                      : "Restore"
                  }
                  disabled={restoringId !== null || deletingId !== null}
                  onClick={(event) => void onRestore(
                    item,
                    isViewableItem(item.kind) && (event.metaKey || event.ctrlKey)
                  )}
                >
                  <ArrowCounterClockwise size={15} />
                  {restoringId === item.id ? "Restoring" : "Restore"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                  disabled={restoringId !== null || deletingId !== null}
                  onClick={() => onDeleteForever(item)}
                >
                  <Trash size={15} />
                  {deletingId === item.id ? "Deleting" : "Delete"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EditorPageLayout>
  );
}

export function DeleteTrashItemDialog({
  item,
  busy,
  onOpenChange,
  onConfirm
}: {
  item: TrashItem | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}): ReactElement {
  return (
    <AlertDialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
              <WarningCircle size={18} weight="fill" />
            </span>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {item ? (
              <>
                This will delete <span className="font-medium text-foreground">{item.name}</span>{" "}
                forever. This action is irreversible.
              </>
            ) : (
              "This will delete this item forever. This action is irreversible."
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
            {busy ? "Deleting" : "Delete"}
          </AlertDialogActionButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TrashItemIcon({ kind }: { kind: TrashItemKind }): ReactElement {
  if (kind === "folder") return <Folder size={13} />;
  if (kind === "database") return <Table size={13} />;
  if (kind === "asset") return <Image size={13} />;
  if (kind === "page") return <FileText size={13} />;
  return <File size={13} />;
}

function kindLabel(kind: TrashItemKind): string {
  if (kind === "asset") return "Upload";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

function isViewableItem(kind: TrashItemKind): boolean {
  return kind === "page" || kind === "folder" || kind === "database";
}

function formatDeletedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown deletion time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

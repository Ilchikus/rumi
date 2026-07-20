import type { ReactElement } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { File } from "@phosphor-icons/react/dist/csr/File";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { Image } from "@phosphor-icons/react/dist/csr/Image";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import type { TrashItem, TrashItemKind } from "@rumi/contracts";
import { Button } from "../ui/button";

interface TrashViewProps {
  items: TrashItem[];
  loadState: "idle" | "loading" | "error";
  restoringId: string | null;
  onRestore: (item: TrashItem) => Promise<void>;
}

export function TrashView({ items, loadState, restoringId, onRestore }: TrashViewProps): ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto w-full max-w-[920px] px-6 pb-24 pt-12 sm:px-10 sm:pt-16 lg:px-12">
        <div className="flex items-start gap-3">
          <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Trash size={21} />
          </span>
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-[2.75rem]">Trash</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Deleted items stay in this workspace and can be restored. Their original location is shown below.
            </p>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-lg border border-border bg-background">
          {loadState === "loading" && items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Loading Trash…</p>
          ) : loadState === "error" && items.length === 0 ? (
            <p className="p-6 text-sm text-destructive">Trash could not be loaded.</p>
          ) : items.length === 0 ? (
            <div className="grid place-items-center px-6 py-16 text-center">
              <Trash size={28} className="text-muted-foreground" />
              <p className="mt-3 font-medium">Trash is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">Items you delete will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-neutral-400">
                    <TrashItemIcon kind={item.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{kindLabel(item.kind)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.originalPath}>
                      From {item.originalPath} · {formatDeletedAt(item.deletedAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={restoringId !== null}
                    onClick={() => void onRestore(item)}
                  >
                    <ArrowCounterClockwise size={15} />
                    {restoringId === item.id ? "Restoring" : "Restore"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    </div>
  );
}

function TrashItemIcon({ kind }: { kind: TrashItemKind }): ReactElement {
  if (kind === "folder") return <Folder size={18} />;
  if (kind === "database") return <Table size={18} />;
  if (kind === "asset") return <Image size={18} />;
  if (kind === "page") return <FileText size={18} />;
  return <File size={18} />;
}

function kindLabel(kind: TrashItemKind): string {
  if (kind === "asset") return "Upload";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

function formatDeletedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown deletion time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

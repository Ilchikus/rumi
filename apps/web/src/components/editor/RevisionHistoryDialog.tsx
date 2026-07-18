import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { FloppyDisk } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { SpinnerGap } from "@phosphor-icons/react/dist/csr/SpinnerGap";
import type { RumiApiClient } from "@rumi/api-client";
import type { RevisionContentResult, RevisionEntry } from "@rumi/contracts";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import { cn } from "../../lib/utils";

export interface RevisionHistoryDialogProps {
  api: RumiApiClient;
  path: string;
  open: boolean;
  dirty: boolean;
  currentMarkdown: () => string;
  onOpenChange: (open: boolean) => void;
  onRestored: () => Promise<void>;
  onMessage: (message: string) => void;
}

export function RevisionHistoryDialog({
  api,
  path,
  open,
  dirty,
  currentMarkdown,
  onOpenChange,
  onRestored,
  onMessage
}: RevisionHistoryDialogProps): ReactElement {
  const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
  const [selected, setSelected] = useState<RevisionContentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const nextRevisions = await api.listRevisions(path);
      setRevisions(nextRevisions);
      const preferred = nextRevisions[0];
      setSelected(preferred ? await api.getRevision(preferred.revisionId) : null);
    } catch (error) {
      onMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [api, onMessage, path]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [load, open]);

  const selectRevision = useCallback(async (revision: RevisionEntry) => {
    try {
      setSelected(await api.getRevision(revision.revisionId));
    } catch (error) {
      onMessage(errorMessage(error));
    }
  }, [api, onMessage]);

  const checkpoint = useCallback(async () => {
    try {
      await api.checkpointNow({ path, reason: "manual-checkpoint" });
      await load();
      onMessage("Snapshot created.");
    } catch (error) {
      onMessage(errorMessage(error));
    }
  }, [api, load, onMessage, path]);

  const restore = useCallback(async () => {
    if (!selected || dirty || restoring) {
      return;
    }

    setRestoring(true);

    try {
      await api.restoreRevision({ revisionId: selected.revision.revisionId });
      await onRestored();
      onOpenChange(false);
      onMessage("Revision restored. The previous current version was snapshotted first.");
    } catch (error) {
      onMessage(errorMessage(error));
    } finally {
      setRestoring(false);
    }
  }, [api, dirty, onMessage, onOpenChange, onRestored, restoring, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(94vw,1050px)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClockCounterClockwise size={19} />
            Revision history
          </DialogTitle>
          <DialogDescription>
            Rumi snapshots are stored under <code>.rumi/revisions</code>. They do not use Git.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[28rem] grid-cols-[15rem_minmax(0,1fr)] overflow-hidden rounded-md border border-border">
          <aside className="overflow-y-auto border-r border-border bg-muted/30 p-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mb-2 w-full"
              disabled={dirty}
              title={dirty ? "Wait for the current edit to save first" : "Create snapshot now"}
              onClick={() => void checkpoint()}
            >
              <FloppyDisk size={15} />
              Snapshot now
            </Button>
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground">
                <SpinnerGap size={15} className="animate-spin" /> Loading
              </p>
            ) : revisions.length > 0 ? (
              revisions.map((revision) => (
                <button
                  key={revision.revisionId}
                  type="button"
                  className={cn(
                    "mb-1 w-full rounded-md px-2 py-2 text-left hover:bg-muted",
                    selected?.revision.revisionId === revision.revisionId && "bg-muted"
                  )}
                  onClick={() => void selectRevision(revision)}
                >
                  <span className="block text-xs font-medium">{reasonLabel(revision.reason)}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {formatRevisionDate(revision.createdAt)}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-4 text-sm text-muted-foreground">No snapshots yet.</p>
            )}
          </aside>

          <div className="min-w-0 overflow-auto p-3">
            {selected ? (
              <div className="grid min-w-[640px] grid-cols-2 gap-3">
                <RevisionPane label="Current" markdown={currentMarkdown()} />
                <RevisionPane label="Selected snapshot" markdown={selected.markdown} />
              </div>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Select a snapshot to compare.
              </div>
            )}
          </div>
        </div>

        {dirty && (
          <p className="text-sm text-muted-foreground">
            The current page still has unsaved edits. Let autosave finish before restoring.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled={!selected || dirty || restoring} onClick={() => void restore()}>
            {restoring ? "Restoring" : "Restore selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevisionPane({ label, markdown }: { label: string; markdown: string }): ReactElement {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</h3>
      <pre className="min-h-[24rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs leading-5">
        {markdown || "(empty document)"}
      </pre>
    </section>
  );
}

function reasonLabel(reason: RevisionEntry["reason"]): string {
  return reason
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRevisionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Revision request failed";
}

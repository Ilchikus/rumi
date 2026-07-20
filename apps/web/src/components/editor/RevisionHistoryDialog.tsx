import { useCallback, useEffect, useMemo, useState } from "react";
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
import { createLineDiff, summarizeLineDiff } from "../../lib/lineDiff";
import type { LineDiffEntry, LineDiffSummary } from "../../lib/lineDiff";
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
  const diff = useMemo(
    () => selected ? createLineDiff(selected.markdown, currentMarkdown()) : [],
    [currentMarkdown, selected]
  );
  const diffSummary = useMemo(() => summarizeLineDiff(diff), [diff]);

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
      onMessage("");
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
      onMessage("");
    } catch (error) {
      onMessage(errorMessage(error));
    } finally {
      setRestoring(false);
    }
  }, [api, dirty, onMessage, onOpenChange, onRestored, restoring, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-2rem)] max-h-[46rem] w-[calc(100vw-2rem)] max-w-[78rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClockCounterClockwise size={19} />
            Revision history
          </DialogTitle>
          <DialogDescription>
            Rumi snapshots are stored under <code>.rumi/revisions</code>. They do not use Git.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[13rem_minmax(0,1fr)] overflow-hidden rounded-md border border-border">
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

          <div className="min-h-0 min-w-0 overflow-hidden">
            {selected ? (
              <RevisionDiff entries={diff} summary={diffSummary} revision={selected.revision} />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Select a snapshot to compare.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevisionDiff({
  entries,
  summary,
  revision
}: {
  entries: LineDiffEntry[];
  summary: LineDiffSummary;
  revision: RevisionEntry;
}): ReactElement {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col" aria-label="Revision code diff">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Selected snapshot → Current</h3>
          <p className="truncate text-xs text-muted-foreground">
            {reasonLabel(revision.reason)} · {formatRevisionDate(revision.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]" aria-label="Diff summary">
          <DiffCount marker="+" count={summary.added} label="added" />
          <DiffCount marker="−" count={summary.removed} label="removed" />
          <DiffCount marker="=" count={summary.unchanged} label="unchanged" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-background">
        <div className="w-max min-w-full font-mono text-xs leading-5" role="table" aria-label="Line changes">
          <div
            className="sticky top-0 z-10 grid grid-cols-[3rem_3rem_1.75rem_minmax(20rem,1fr)] border-b border-border bg-muted text-[10px] uppercase tracking-wide text-muted-foreground"
            role="row"
          >
            <span className="px-2 py-1 text-right" role="columnheader">Old</span>
            <span className="px-2 py-1 text-right" role="columnheader">New</span>
            <span className="py-1 text-center" role="columnheader">Change</span>
            <span className="px-2 py-1" role="columnheader">Source</span>
          </div>

          {entries.length > 0 ? entries.map((entry, index) => (
            <div
              key={`${index}-${entry.kind}`}
              className={cn(
                "grid grid-cols-[3rem_3rem_1.75rem_minmax(20rem,1fr)] border-b border-border/40",
                entry.kind === "added" && "bg-neutral-200/70 text-foreground",
                entry.kind === "removed" && "bg-neutral-100 text-muted-foreground",
                entry.kind === "unchanged" && "bg-background text-foreground"
              )}
              role="row"
            >
              <DiffLineNumber value={entry.oldLineNumber} />
              <DiffLineNumber value={entry.newLineNumber} />
              <span className="select-none border-r border-border/60 text-center font-semibold" role="cell">
                {entry.kind === "added" ? "+" : entry.kind === "removed" ? "−" : " "}
                <span className="sr-only">{entry.kind}</span>
              </span>
              <span className="whitespace-pre px-2" role="cell">{entry.text || " "}</span>
            </div>
          )) : (
            <p className="p-6 text-center font-sans text-sm text-muted-foreground">
              The snapshot and current page are both empty.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function DiffCount({ marker, count, label }: { marker: string; count: number; label: string }): ReactElement {
  return (
    <span className="rounded border border-border bg-background px-1.5 py-0.5 text-muted-foreground">
      <span className="font-mono font-semibold text-foreground">{marker}{count}</span> {label}
    </span>
  );
}

function DiffLineNumber({ value }: { value: number | null }): ReactElement {
  return (
    <span className="select-none border-r border-border/60 bg-muted/40 px-2 text-right text-muted-foreground" role="cell">
      {value ?? ""}
    </span>
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

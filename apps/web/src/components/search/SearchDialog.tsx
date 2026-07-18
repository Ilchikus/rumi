import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import type { RumiApiClient } from "@rumi/api-client";
import type { PageDocumentKind, SearchWorkspaceResultItem, WorkspaceNodeKind } from "@rumi/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

type SearchFilter = "all" | PageDocumentKind;

export interface SearchDialogProps {
  api: RumiApiClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenItem: (item: SearchWorkspaceResultItem) => void;
  onMessage: (message: string) => void;
}

export function SearchDialog({
  api,
  open,
  onOpenChange,
  onOpenItem,
  onMessage
}: SearchDialogProps): ReactElement {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [items, setItems] = useState<SearchWorkspaceResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setItems([]);
      setSelectedIndex(0);
      return;
    }

    const normalized = query.trim();

    if (!normalized) {
      setItems([]);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);

      try {
        const result = await api.searchWorkspace({
          query: normalized,
          ...(filter === "all" ? {} : { kinds: [nodeKindForPageKind(filter)] }),
          limit: 50
        });

        if (requestId === requestIdRef.current) {
          setItems(result.items);
          setSelectedIndex(0);
        }
      } catch (error) {
        if (requestId === requestIdRef.current) {
          onMessage(error instanceof Error ? error.message : "Search failed");
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [api, filter, onMessage, open, query]);

  const filters = useMemo<Array<{ value: SearchFilter; label: string }>>(
    () => [
      { value: "all", label: "All" },
      { value: "page", label: "Pages" },
      { value: "folder", label: "Folders" },
      { value: "database", label: "Databases" }
    ],
    []
  );

  const openSelected = (item = items[selectedIndex]) => {
    if (!item) {
      return;
    }

    onOpenItem(item);
    onOpenChange(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => items.length > 0 ? (current + 1) % items.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => items.length > 0 ? (current - 1 + items.length) % items.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      openSelected();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search workspace</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <MagnifyingGlass size={18} className="shrink-0 text-muted-foreground" />
          <Input
            value={query}
            autoFocus
            className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
            placeholder="Search pages, folders, databases, properties, and content"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <span className="text-xs text-muted-foreground">Searching…</span>}
        </div>

        <div className="flex gap-1 border-b border-border px-3 py-2">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                filter === option.value && "bg-muted font-medium text-foreground"
              )}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="max-h-[28rem] min-h-48 overflow-y-auto p-1.5">
          {items.length > 0 ? (
            items.map((item, index) => (
              <button
                key={item.path}
                type="button"
                className={cn(
                  "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted",
                  selectedIndex === index && "bg-muted"
                )}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => openSelected(item)}
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center text-neutral-400">
                  <SearchResultIcon kind={item.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{displayPath(item.path)}</span>
                  {item.snippet && (
                    <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{item.snippet}</span>
                  )}
                </span>
              </button>
            ))
          ) : query.trim() && !loading ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">No results found.</p>
          ) : (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Start typing to search the server-owned workspace index.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchResultIcon({ kind }: { kind: PageDocumentKind }): ReactElement {
  return kind === "database" ? <Table size={17} /> : kind === "folder" ? <Folder size={17} /> : <FileText size={17} />;
}

function nodeKindForPageKind(kind: PageDocumentKind): WorkspaceNodeKind {
  return kind;
}

function displayPath(value: string): string {
  return value.split("/").map((part) => part.replace(/\.(?:index|db)\.md$|\.md$/i, "")).join(" / ");
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import type { RumiApiClient } from "@rumi/api-client";
import type {
  PageDocumentKind,
  SearchWorkspaceResultItem,
  WorkspaceNode,
  WorkspaceNodeKind
} from "@rumi/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { resolveRecentDocuments } from "../../lib/recentDocuments";
import { cn } from "../../lib/utils";

type SearchFilter = "all" | PageDocumentKind | "recent";

const SEARCH_FILTERS: ReadonlyArray<{ value: SearchFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "page", label: "Pages" },
  { value: "folder", label: "Folders" },
  { value: "database", label: "Databases" },
  { value: "recent", label: "Recent" }
];

export interface SearchDialogProps {
  api: RumiApiClient;
  tree: WorkspaceNode | null;
  workspaceRootPath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenItem: (item: SearchWorkspaceResultItem) => void;
  onMessage: (message: string) => void;
}

export function SearchDialog({
  api,
  tree,
  workspaceRootPath,
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recentItems = useMemo(
    () => open && tree && workspaceRootPath
      ? resolveRecentDocuments(window.localStorage, workspaceRootPath, tree)
      : [],
    [open, tree, workspaceRootPath]
  );
  const filteredRecentItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return recentItems;
    return recentItems.filter((item) =>
      item.title.toLocaleLowerCase().includes(normalized)
      || item.path.toLocaleLowerCase().includes(normalized)
    );
  }, [query, recentItems]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    if (!open) {
      setQuery("");
      setItems([]);
      setSelectedIndex(0);
      setLoading(false);
      return;
    }

    if (filter === "recent") {
      setItems(filteredRecentItems);
      setSelectedIndex(0);
      setLoading(false);
      return;
    }

    const normalized = query.trim();

    if (!normalized) {
      setItems([]);
      setLoading(false);
      return;
    }

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
  }, [api, filter, filteredRecentItems, onMessage, open, query]);

  const selectFilter = useCallback((nextFilter: SearchFilter) => {
    requestIdRef.current += 1;
    setFilter(nextFilter);
    setSelectedIndex(0);
    inputRef.current?.focus({ preventScroll: true });
    window.queueMicrotask(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);

  const restoreInputFocusAfterTab = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Tab") inputRef.current?.focus({ preventScroll: true });
  };

  const openSelected = (item = items[selectedIndex]) => {
    if (!item) {
      return;
    }

    onOpenItem(item);
    onOpenChange(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const currentIndex = SEARCH_FILTERS.findIndex((option) => option.value === filter);
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = (currentIndex + direction + SEARCH_FILTERS.length) % SEARCH_FILTERS.length;
      const nextFilter = SEARCH_FILTERS[nextIndex]?.value;
      if (nextFilter) selectFilter(nextFilter);
      return;
    }

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
      <DialogContent
        className="max-w-2xl p-0"
        onKeyDownCapture={handleKeyDown}
        onKeyUpCapture={restoreInputFocusAfterTab}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search workspace</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <MagnifyingGlass size={18} className="shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            autoFocus
            role="combobox"
            aria-autocomplete="list"
            aria-controls="search-result-list"
            aria-expanded={items.length > 0}
            aria-activedescendant={items[selectedIndex] ? `search-result-${selectedIndex}` : undefined}
            className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
            placeholder="Search pages, folders, databases, properties, and content"
            onChange={(event) => setQuery(event.target.value)}
          />
          {loading && <span className="text-xs text-muted-foreground">Searching…</span>}
        </div>

        <div
          className="flex gap-1 border-b border-border px-3 py-2"
          role="tablist"
          aria-label="Search result filters"
        >
          {SEARCH_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              id={`search-filter-${option.value}`}
              role="tab"
              aria-selected={filter === option.value}
              aria-controls="search-results-panel"
              tabIndex={filter === option.value ? 0 : -1}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                filter === option.value && "bg-muted font-medium text-foreground"
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div
          id="search-results-panel"
          className="max-h-[28rem] min-h-48 overflow-y-auto p-1.5"
          role="tabpanel"
          aria-labelledby={`search-filter-${filter}`}
        >
          {items.length > 0 ? (
            <div id="search-result-list" role="listbox" aria-label="Search results">
              {items.map((item, index) => (
                <button
                  key={item.path}
                  id={`search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === index}
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
              ))}
            </div>
          ) : filter === "recent" && !query.trim() ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">No recent documents.</p>
          ) : query.trim() && !loading ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">No results found.</p>
          ) : (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {filter === "recent"
                ? "Recently opened documents appear here."
                : "Start typing to search the server-owned workspace index."}
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

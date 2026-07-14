import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { SidebarSimple } from "@phosphor-icons/react";
import { RumiApiClient } from "@rumi/api-client";
import type { PageDocument, RumiEvent, SavePageResult, WorkspaceNode } from "@rumi/contracts";
import { LightProseMirrorEditor, type LightProseMirrorEditorHandle } from "./components/editor/LightProseMirrorEditor";
import { Sidebar } from "./components/sidebar/Sidebar";
import type { SidebarSelection } from "./components/sidebar/Sidebar";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";

type LoadState = "idle" | "loading" | "error";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

const SIDEBAR_WIDTH_KEY = "rumi-new-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "rumi-new-sidebar-collapsed";
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const MOBILE_SIDEBAR_TRANSITION_MS = 200;

export function App(): ReactElement {
  const api = useMemo(() => new RumiApiClient(), []);
  const [workspaceName, setWorkspaceName] = useState("Rumi");
  const [tree, setTree] = useState<WorkspaceNode | null>(null);
  const [selection, setSelection] = useState<SidebarSelection | null>(null);
  const [page, setPage] = useState<PageDocument | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => getSavedSidebarWidth());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => getSavedSidebarCollapsed());
  const [sidebarMounted, setSidebarMounted] = useState(() => !sidebarCollapsed);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => getViewportWidth());
  const pageRef = useRef<PageDocument | null>(null);
  const draftBodyRef = useRef("");
  const saveStateRef = useRef<SaveState>("idle");
  const selectionRef = useRef<SidebarSelection | null>(null);
  const editorRef = useRef<LightProseMirrorEditorHandle | null>(null);
  const pageLoadCacheRef = useRef<Map<string, Promise<PageDocument>>>(new Map());
  const pageLoadCacheGenerationRef = useRef(0);
  const openRequestIdRef = useRef(0);
  const isNarrow = viewportWidth < 768;
  const visibleSidebarWidth = Math.min(sidebarWidth, isNarrow ? Math.max(260, Math.floor(viewportWidth * 0.86)) : MAX_SIDEBAR_WIDTH);
  const renderSidebar = !sidebarCollapsed || (isNarrow && sidebarMounted);
  const blurContent = isNarrow && !sidebarCollapsed;

  const loadTree = useCallback(async () => {
    setLoadState("loading");
    setMessage("");

    try {
      const [workspace, nextTree] = await Promise.all([api.getWorkspace(), api.getTree()]);
      setWorkspaceName(workspace.name);
      setTree(nextTree);
      setLoadState("idle");
    } catch (error) {
      setLoadState("error");
      setMessage(errorMessage(error));
    }
  }, [api]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    draftBodyRef.current = draftBody;
  }, [draftBody]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const getCurrentDraftBody = useCallback(() => editorRef.current?.getMarkdown() ?? draftBodyRef.current, []);

  const clearPageLoadCache = useCallback(() => {
    pageLoadCacheGenerationRef.current += 1;
    pageLoadCacheRef.current.clear();
  }, []);

  const forgetCachedPage = useCallback((path: string) => {
    pageLoadCacheGenerationRef.current += 1;
    pageLoadCacheRef.current.delete(path);
  }, []);

  const cacheResolvedPage = useCallback((nextPage: PageDocument) => {
    pageLoadCacheRef.current.set(nextPage.path, Promise.resolve(nextPage));
  }, []);

  const loadPage = useCallback(
    async (path: string): Promise<PageDocument> => {
      const cachedRequest = pageLoadCacheRef.current.get(path);

      if (cachedRequest) {
        return cachedRequest;
      }

      const requestGeneration = pageLoadCacheGenerationRef.current;
      const request = api.openPage(path).then(
        (nextPage) => {
          if (pageLoadCacheGenerationRef.current === requestGeneration && pageLoadCacheRef.current.get(path) === request) {
            cacheResolvedPage(nextPage);
          }

          return nextPage;
        },
        (error: unknown) => {
          if (pageLoadCacheRef.current.get(path) === request) {
            pageLoadCacheRef.current.delete(path);
          }

          throw error;
        }
      );

      pageLoadCacheRef.current.set(path, request);
      return request;
    },
    [api, cacheResolvedPage]
  );

  const prefetchNode = useCallback(
    (node: WorkspaceNode) => {
      const openPath = openPathForNode(node);

      if (!openPath || pageRef.current?.path === openPath) {
        return;
      }

      void loadPage(openPath);
    },
    [loadPage]
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(getViewportWidth());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isNarrow || sidebarCollapsed) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarCollapsedState(true, setSidebarCollapsed);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNarrow, sidebarCollapsed]);

  useEffect(() => {
    if (!sidebarCollapsed) {
      setSidebarMounted(true);
      return;
    }

    if (!isNarrow) {
      setSidebarMounted(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSidebarMounted(false);
    }, MOBILE_SIDEBAR_TRANSITION_MS);

    return () => window.clearTimeout(timeout);
  }, [isNarrow, sidebarCollapsed]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = clamp(event.clientX, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
      setSidebarWidth(nextWidth);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, JSON.stringify(nextWidth));
    };
    const handlePointerUp = () => setIsResizingSidebar(false);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSidebar]);

  const openNode = useCallback(
    async (node: WorkspaceNode) => {
      const requestId = ++openRequestIdRef.current;
      const openPath = openPathForNode(node);
      setSelection({ nodePath: node.path, openPath, kind: node.kind });
      setSaveState("idle");
      setMessage("");

      if (isNarrow && openPath) {
        setSidebarCollapsedState(true, setSidebarCollapsed);
      }

      if (!openPath) {
        setPage(null);
        setDraftBody("");
        return;
      }

      setLoadState("loading");

      try {
        const nextPage = await loadPage(openPath);

        if (requestId !== openRequestIdRef.current) {
          return;
        }

        setPage(nextPage);
        setDraftBody(nextPage.markdownBody);
        setLoadState("idle");
      } catch (error) {
        if (requestId !== openRequestIdRef.current) {
          return;
        }

        setLoadState("error");
        setMessage(errorMessage(error));
      }
    },
    [isNarrow, loadPage]
  );

  const refreshAfterMutation = useCallback(
    async (openPath?: string | null) => {
      await loadTree();

      if (openPath) {
        const nextPage = await loadPage(openPath);
        setPage(nextPage);
        setDraftBody(nextPage.markdownBody);
        setSelection({ nodePath: openPath, openPath, kind: "page" });
      }
    },
    [loadPage, loadTree]
  );

  const createPage = useCallback(async (parentPath: string, name: string) => {
    try {
      const result = await api.createPage({
        parentPath,
        name,
        markdownBody: `# ${stripMarkdownExtension(name)}\n`
      });
      clearPageLoadCache();
      await refreshAfterMutation(result.path);
      setMessage(`Created ${result.path}`);
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      throw error;
    }
  }, [api, clearPageLoadCache, refreshAfterMutation]);

  const createFolder = useCallback(async (parentPath: string, name: string) => {
    try {
      const result = await api.createFolder({ parentPath, name });
      clearPageLoadCache();
      await refreshAfterMutation(result.path);
      setMessage(`Created ${result.path}`);
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      throw error;
    }
  }, [api, clearPageLoadCache, refreshAfterMutation]);

  const renameNode = useCallback(
    async (node: WorkspaceNode, nextName: string): Promise<boolean> => {
      if (!canMutate(node) || !nextName.trim()) {
        return false;
      }

      try {
        const currentSelection = selectionRef.current;
        const result = await api.renameNode({ path: node.path, newName: nextName.trim() });
        clearPageLoadCache();
        await loadTree();

        if (currentSelection && isSameOrDescendant(currentSelection.nodePath, node.path)) {
          const nextNodePath =
            currentSelection.nodePath === node.path
              ? result.path
              : replacePathPrefix(currentSelection.nodePath, node.path, result.path);
          const nextOpenTarget =
            currentSelection.nodePath === node.path
              ? result.path
              : currentSelection.openPath
                ? replacePathPrefix(currentSelection.openPath, node.path, result.path)
                : nextNodePath;

          try {
            const nextPage = await loadPage(nextOpenTarget);
            setPage(nextPage);
            setDraftBody(nextPage.markdownBody);
            setSelection({ nodePath: nextNodePath, openPath: nextPage.path, kind: pageKindToNodeKind(nextPage.kind) });
            setSaveState("idle");
          } catch {
            setPage(null);
            setDraftBody("");
            setSelection(null);
          }
        }

        setMessage(`Renamed ${result.previousPath ?? node.path} to ${result.path}`);
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        setSaveState("error");
        return false;
      }
    },
    [api, clearPageLoadCache, loadPage, loadTree]
  );

  const deleteNode = useCallback(
    async (node: WorkspaceNode): Promise<boolean> => {
      if (!canMutate(node)) {
        return false;
      }

      try {
        const isFolder = node.kind === "folder" || node.kind === "database";
        await api.deleteNode({ path: node.path, recursive: isFolder });
        clearPageLoadCache();
        await loadTree();

        const currentSelection = selectionRef.current;

        if (currentSelection && isSameOrDescendant(currentSelection.nodePath, node.path)) {
          setPage(null);
          setDraftBody("");
          setSelection(null);
        }

        setMessage(`Deleted ${node.path}`);
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        setSaveState("error");
        return false;
      }
    },
    [api, clearPageLoadCache, loadTree]
  );

  const moveNode = useCallback(
    async (node: WorkspaceNode, newParentPath: string): Promise<boolean> => {
      if (!canMutate(node)) {
        return false;
      }

      try {
        const currentSelection = selectionRef.current;
        const currentPage = pageRef.current;
        const wasDirty = saveStateRef.current === "dirty";
        const result = await api.moveNode({ path: node.path, newParentPath });
        clearPageLoadCache();
        await loadTree();

        if (currentSelection && isSameOrDescendant(currentSelection.nodePath, node.path)) {
          const nextNodePath =
            currentSelection.nodePath === node.path
              ? result.path
              : replacePathPrefix(currentSelection.nodePath, node.path, result.path);
          const nextOpenTarget =
            currentSelection.nodePath === node.path
              ? result.path
              : currentSelection.openPath
                ? replacePathPrefix(currentSelection.openPath, node.path, result.path)
                : currentSelection.openPath;

          if (!nextOpenTarget) {
            setPage(null);
            setDraftBody("");
            setSelection({ nodePath: nextNodePath, openPath: null, kind: currentSelection.kind });
            setSaveState("idle");
          } else if (wasDirty && currentPage && currentSelection.openPath) {
            const currentDraftBody = getCurrentDraftBody();
            const nextPagePath = replacePathPrefix(currentPage.path, node.path, result.path);
            setPage({ ...currentPage, path: nextPagePath, markdownBody: currentDraftBody });
            setDraftBody(currentDraftBody);
            setSelection({ nodePath: nextNodePath, openPath: nextPagePath, kind: pageKindToNodeKind(currentPage.kind) });
            setSaveState("dirty");
          } else {
            try {
              const nextPage = await loadPage(nextOpenTarget);
              setPage(nextPage);
              setDraftBody(nextPage.markdownBody);
              setSelection({ nodePath: nextNodePath, openPath: nextPage.path, kind: pageKindToNodeKind(nextPage.kind) });
              setSaveState("idle");
            } catch {
              setPage(null);
              setDraftBody("");
              setSelection({ nodePath: nextNodePath, openPath: null, kind: currentSelection.kind });
              setSaveState("idle");
            }
          }
        }

        setMessage(`Moved ${result.previousPath ?? node.path} to ${result.path}`);
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        setSaveState("error");
        return false;
      }
    },
    [api, clearPageLoadCache, getCurrentDraftBody, loadPage, loadTree]
  );

  const savePage = useCallback(async () => {
    if (!page) {
      return;
    }

    setSaveState("saving");
    setMessage("");

    const markdownBody = getCurrentDraftBody();

    try {
      const result: SavePageResult = await api.savePage({
        path: page.path,
        baseVersion: page.version,
        frontmatter: page.frontmatter,
        markdownBody,
        reason: "manual-save"
      });

      if (result.status === "conflict") {
        forgetCachedPage(page.path);
        setSaveState("conflict");
        setMessage("This page changed on disk. Reload it before saving again.");
        return;
      }

      const savedPage = {
        ...page,
        markdownBody,
        version: result.version,
        contentHash: result.contentHash
      };

      setPage(savedPage);
      cacheResolvedPage(savedPage);
      editorRef.current?.markClean(markdownBody);
      setDraftBody(markdownBody);
      setSaveState("saved");
      setMessage("Saved");
      await loadTree();
    } catch (error) {
      setSaveState("error");
      setMessage(errorMessage(error));
    }
  }, [api, cacheResolvedPage, forgetCachedPage, getCurrentDraftBody, loadTree, page]);

  const reloadPage = useCallback(async () => {
    if (page) {
      forgetCachedPage(page.path);
      await openNode({
        path: page.path,
        name: page.path.split("/").at(-1) ?? page.path,
        kind: "page"
      });
    }
  }, [forgetCachedPage, openNode, page]);

  const handlePageChangedEvent = useCallback(
    async (event: RumiEvent) => {
      if (!event.path) {
        return;
      }

      forgetCachedPage(event.path);
      await loadTree();

      const currentPage = pageRef.current;

      if (!currentPage || currentPage.path !== event.path) {
        return;
      }

      if (event.version && currentPage.version === event.version) {
        return;
      }

      if (saveStateRef.current === "dirty") {
        setSaveState("conflict");
        setMessage("This page changed elsewhere. Reload it before saving again.");
        return;
      }

      if (saveStateRef.current === "saving") {
        return;
      }

      try {
        const nextPage = await loadPage(event.path);
        setPage(nextPage);
        setDraftBody(nextPage.markdownBody);
        setSaveState("idle");
        setMessage("Page refreshed from server.");
      } catch (error) {
        setSaveState("error");
        setMessage(errorMessage(error));
      }
    },
    [forgetCachedPage, loadPage, loadTree]
  );

  const handleMovedEvent = useCallback(
    async (event: RumiEvent) => {
      if (!event.path || !event.previousPath) {
        clearPageLoadCache();
        await loadTree();
        return;
      }

      clearPageLoadCache();
      await loadTree();

      const currentSelection = selectionRef.current;

      if (!currentSelection || !isSameOrDescendant(currentSelection.nodePath, event.previousPath)) {
        return;
      }

      const nextNodePath =
        currentSelection.nodePath === event.previousPath
          ? event.path
          : replacePathPrefix(currentSelection.nodePath, event.previousPath, event.path);
      const nextOpenTarget =
        currentSelection.nodePath === event.previousPath
          ? event.path
          : currentSelection.openPath
            ? replacePathPrefix(currentSelection.openPath, event.previousPath, event.path)
            : nextNodePath;

      if (saveStateRef.current === "dirty") {
        const currentDraftBody = getCurrentDraftBody();
        setSelection({ ...currentSelection, nodePath: nextNodePath, openPath: nextOpenTarget });
        setPage((currentPage) =>
          currentPage ? { ...currentPage, path: nextOpenTarget, markdownBody: currentDraftBody } : currentPage
        );
        setDraftBody(currentDraftBody);
        setSaveState("conflict");
        setMessage("This page moved elsewhere while it had local edits.");
        return;
      }

      try {
        const nextPage = await loadPage(nextOpenTarget);
        setPage(nextPage);
        setDraftBody(nextPage.markdownBody);
        setSelection({ nodePath: nextNodePath, openPath: nextPage.path, kind: pageKindToNodeKind(nextPage.kind) });
        setSaveState("idle");
      } catch (error) {
        setSaveState("error");
        setMessage(errorMessage(error));
      }
    },
    [clearPageLoadCache, getCurrentDraftBody, loadPage, loadTree]
  );

  const handleDeletedEvent = useCallback(
    async (event: RumiEvent) => {
      if (!event.path) {
        clearPageLoadCache();
        await loadTree();
        return;
      }

      clearPageLoadCache();
      await loadTree();

      const currentSelection = selectionRef.current;

      if (currentSelection && isSameOrDescendant(currentSelection.nodePath, event.path)) {
        setPage(null);
        setDraftBody("");
        setSelection(null);
        setSaveState("idle");
        setMessage("The open item was deleted.");
      }
    },
    [clearPageLoadCache, loadTree]
  );

  useEffect(() => {
    return api.subscribeEvents((event) => {
      if (event.name === "page.changed") {
        void handlePageChangedEvent(event);
      }

      if (event.name === "page.moved") {
        void handleMovedEvent(event);
      }

      if (event.name === "page.deleted") {
        void handleDeletedEvent(event);
      }

      if (event.name === "folder.childrenChanged" || event.name === "workspace.treeChanged") {
        clearPageLoadCache();
        void loadTree();
      }
    });
  }, [api, clearPageLoadCache, handleDeletedEvent, handleMovedEvent, handlePageChangedEvent, loadTree]);

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-background text-foreground">
      {isNarrow && renderSidebar && (
        <button
          type="button"
          className={cn(
            "fixed inset-0 z-30 bg-foreground/20 transition-opacity duration-200 ease-out",
            sidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100"
          )}
          aria-label="Close sidebar"
          onClick={() => setSidebarCollapsedState(true, setSidebarCollapsed)}
        />
      )}

      {renderSidebar ? (
        <div
          className={cn(
            "relative z-40 h-screen min-h-0 shrink-0 bg-background",
            isNarrow && [
              "fixed inset-y-0 left-0 transform-gpu shadow-xl transition-transform duration-200 ease-out",
              sidebarCollapsed ? "pointer-events-none -translate-x-full" : "translate-x-0"
            ]
          )}
          style={{ width: visibleSidebarWidth }}
        >
          <Sidebar
            workspaceName={workspaceName}
            tree={tree}
            selection={selection}
            loadState={loadState}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsedState(!sidebarCollapsed, setSidebarCollapsed)}
            onRefresh={() => void loadTree()}
            onPrefetchNode={prefetchNode}
            onOpenNode={(node) => void openNode(node)}
            onCreatePage={createPage}
            onCreateFolder={createFolder}
            onRenameNode={renameNode}
            onMoveNode={moveNode}
            onDeleteNode={deleteNode}
          />
          {!isNarrow && (
            <button
              type="button"
              className="absolute inset-y-0 right-0 z-50 w-1 cursor-col-resize hover:bg-primary/40"
              aria-label="Resize sidebar"
              onPointerDown={(event) => {
                event.preventDefault();
                setIsResizingSidebar(true);
              }}
            />
          )}
        </div>
      ) : !isNarrow ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="fixed left-3 top-3 z-30 bg-background shadow-sm"
          onClick={() => setSidebarCollapsedState(false, setSidebarCollapsed)}
          title="Open sidebar"
        >
          <SidebarSimple size={17} />
        </Button>
      ) : null}

      {isNarrow && sidebarCollapsed && !sidebarMounted && (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="fixed left-3 top-3 z-30 bg-background shadow-sm"
          onClick={() => setSidebarCollapsedState(false, setSidebarCollapsed)}
          title="Open sidebar"
        >
          <SidebarSimple size={17} />
        </Button>
      )}

      <section
        className={cn(
          "grid min-h-screen min-w-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] transition-[filter] duration-200 ease-out",
          blurContent ? "blur-sm" : "blur-0"
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Page</p>
            <h2 className="truncate text-lg font-semibold">{page ? displayPath(page.path) : "Select a Markdown page"}</h2>
          </div>
          <div className="flex gap-2">
            {page && (
              <>
                <Button type="button" variant="outline" onClick={reloadPage}>
                  Reload
                </Button>
                <Button type="button" disabled={saveState === "saving"} onClick={savePage}>
                  {saveState === "saving" ? "Saving" : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>

        {message && (
          <div
            className={cn(
              "mx-4 mt-3 rounded-md border px-3 py-2 text-sm",
              saveState === "conflict" || saveState === "error" || loadState === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted"
            )}
          >
            {message}
          </div>
        )}

        {page ? (
          <div className="grid min-h-0 gap-3 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <section className="min-h-0 overflow-auto rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Frontmatter</p>
              <pre className="overflow-auto text-xs leading-5">{JSON.stringify(page.frontmatter, null, 2)}</pre>
              <p className="mt-3 text-xs text-muted-foreground">version {page.version.slice(0, 10)}</p>
            </section>

            <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Markdown body</span>
              <div className="min-h-[55vh] overflow-auto rounded-md border border-input bg-background">
                <LightProseMirrorEditor
                  ref={editorRef}
                  documentKey={page.path}
                  markdown={draftBody}
                  onDirty={() => {
                  setSaveState("dirty");
                  setMessage("");
                }}
                />
              </div>
            </section>
          </div>
        ) : (
          <div className="grid place-items-center p-8 text-muted-foreground">
            <p>Open a page from the sidebar.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function canMutate(node: WorkspaceNode | null): boolean {
  return Boolean(node && node.kind !== "workspace");
}

function getViewportWidth(): number {
  return typeof window === "undefined" ? 1024 : window.innerWidth;
}

function getSavedSidebarWidth(): number {
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);

    if (saved) {
      return clamp(JSON.parse(saved) as number, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
    }
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  return DEFAULT_SIDEBAR_WIDTH;
}

function getSavedSidebarCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved ? Boolean(JSON.parse(saved)) : false;
  } catch {
    return false;
  }
}

function setSidebarCollapsedState(
  collapsed: boolean,
  setCollapsed: (collapsed: boolean) => void
): void {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
  setCollapsed(collapsed);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isSameOrDescendant(candidate: string, parentPath: string): boolean {
  return candidate === parentPath || candidate.startsWith(`${parentPath}/`);
}

function replacePathPrefix(path: string, previousPrefix: string, nextPrefix: string): string {
  if (path === previousPrefix) {
    return nextPrefix;
  }

  if (path.startsWith(`${previousPrefix}/`)) {
    return `${nextPrefix}${path.slice(previousPrefix.length)}`;
  }

  return path;
}

function pageKindToNodeKind(kind: PageDocument["kind"]): WorkspaceNode["kind"] {
  return kind === "database" ? "database" : kind === "folder" ? "folder" : "page";
}

function openPathForNode(node: WorkspaceNode): string | null {
  return node.companionPath ?? (node.kind === "page" ? node.path : null);
}

function displayPath(path: string): string {
  return path
    .split("/")
    .map(stripMarkdownExtension)
    .join(" / ");
}

function stripMarkdownExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

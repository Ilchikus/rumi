import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { SidebarSimple } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { RumiApiClient } from "@rumi/api-client";
import type {
  PageDocument,
  RumiEvent,
  SavePageReason,
  SavePageResult,
  SearchWorkspaceResultItem,
  WorkspaceNode
} from "@rumi/contracts";
import type {
  RumiBlockEditorHandle,
  RumiDocumentLink
} from "./components/editor/RumiBlockEditor";
import { DatabaseView } from "./components/database/DatabaseView";
import { PageProperties } from "./components/editor/PageProperties";
import { RevisionHistoryDialog } from "./components/editor/RevisionHistoryDialog";
import { pageTitleFromPath } from "./components/editor/pagePresentation";
import { Sidebar } from "./components/sidebar/Sidebar";
import type { SidebarSelection } from "./components/sidebar/Sidebar";
import { Button } from "./components/ui/button";
import { SearchDialog } from "./components/search/SearchDialog";
import {
  clearLastOpenedPage,
  findWorkspaceNode,
  readLastOpenedPage,
  writeLastOpenedPage
} from "./lib/lastOpenedPage";
import { cn } from "./lib/utils";

const RumiBlockEditor = lazy(async () => {
  const module = await import("./components/editor/RumiBlockEditor");
  return { default: module.RumiBlockEditor };
});

type LoadState = "idle" | "loading" | "error";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

const SIDEBAR_WIDTH_KEY = "rumi-new-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "rumi-new-sidebar-collapsed";
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const MOBILE_SIDEBAR_TRANSITION_MS = 200;
const AUTOSAVE_DELAY_MS = 800;

export function App(): ReactElement {
  const api = useMemo(() => new RumiApiClient(), []);
  const [workspaceName, setWorkspaceName] = useState("Rumi");
  const [workspaceRootPath, setWorkspaceRootPath] = useState("");
  const [tree, setTree] = useState<WorkspaceNode | null>(null);
  const [selection, setSelection] = useState<SidebarSelection | null>(null);
  const [page, setPage] = useState<PageDocument | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [editorRevision, setEditorRevision] = useState(0);
  const [databaseRefreshRevision, setDatabaseRefreshRevision] = useState(0);
  const [revisionHistoryOpen, setRevisionHistoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => getSavedSidebarWidth());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => getSavedSidebarCollapsed());
  const [sidebarMounted, setSidebarMounted] = useState(() => !sidebarCollapsed);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => getViewportWidth());
  const pageRef = useRef<PageDocument | null>(null);
  const draftBodyRef = useRef("");
  const saveStateRef = useRef<SaveState>("idle");
  const selectionRef = useRef<SidebarSelection | null>(null);
  const editorRef = useRef<RumiBlockEditorHandle | null>(null);
  const editorRevisionRef = useRef(0);
  const saveReasonRef = useRef<SavePageReason>("editor-autosave");
  const pageLoadCacheRef = useRef<Map<string, Promise<PageDocument>>>(new Map());
  const pageLoadCacheGenerationRef = useRef(0);
  const openRequestIdRef = useRef(0);
  const restoredWorkspaceRef = useRef<string | null>(null);
  const isNarrow = viewportWidth < 768;
  const visibleSidebarWidth = Math.min(sidebarWidth, isNarrow ? Math.max(260, Math.floor(viewportWidth * 0.86)) : MAX_SIDEBAR_WIDTH);
  const renderSidebar = !sidebarCollapsed || (isNarrow && sidebarMounted);
  const blurContent = isNarrow && !sidebarCollapsed;
  const pageTitle = page ? pageTitleFromPath(page.path, page.kind) : null;
  const editorDocuments = useMemo(() => collectEditorDocuments(tree), [tree]);

  const loadTree = useCallback(async () => {
    setLoadState("loading");
    setMessage("");

    try {
      const [workspace, nextTree] = await Promise.all([api.getWorkspace(), api.getTree()]);
      setWorkspaceName(workspace.name);
      setWorkspaceRootPath(workspace.rootPath);
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
    setRevisionHistoryOpen(false);
  }, [page?.path]);

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

  const markPageDirty = useCallback((reason: SavePageReason) => {
    saveReasonRef.current = reason;
    editorRevisionRef.current += 1;
    setEditorRevision(editorRevisionRef.current);
    setSaveState("dirty");
    setMessage("");
  }, []);

  const updatePageFrontmatter = useCallback(
    (frontmatter: PageDocument["frontmatter"]) => {
      const currentPage = pageRef.current;

      if (!currentPage || currentPage.kind === "database") {
        return;
      }

      const nextPage = { ...currentPage, frontmatter };
      pageRef.current = nextPage;
      setPage(nextPage);
      markPageDirty("property-edit");
    },
    [markPageDirty]
  );

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

  const createOpenPageDatabaseOption = useCallback(
    async (property: string, option: string): Promise<boolean> => {
      const currentPage = pageRef.current;
      const database = currentPage?.database;
      const definition = database?.schema.properties[property];

      if (
        !currentPage ||
        !database ||
        !definition ||
        (definition.type !== "select" && definition.type !== "multi-select")
      ) {
        return false;
      }

      try {
        const result = await api.createDatabasePropertyOption({
          databasePath: database.databasePath,
          baseVersion: database.schemaVersion,
          property,
          option
        });

        if (result.status === "conflict") {
          forgetCachedPage(currentPage.path);
          setMessage("The database options changed elsewhere. Reopen this record and try again.");
          return false;
        }

        const latestPage = pageRef.current;
        if (latestPage?.path !== currentPage.path || !latestPage.database) {
          return false;
        }

        const latestDefinition = latestPage.database.schema.properties[property];
        if (
          !latestDefinition ||
          (latestDefinition.type !== "select" && latestDefinition.type !== "multi-select")
        ) {
          return false;
        }

        const optionAlreadyPresent = (latestDefinition.options ?? []).some(
          (candidate) => candidate.name.toLowerCase() === option.toLowerCase()
        );

        const nextPage: PageDocument = {
          ...latestPage,
          database: {
            ...latestPage.database,
            schemaVersion: optionAlreadyPresent ? latestPage.database.schemaVersion : result.version,
            schema: {
              ...latestPage.database.schema,
              properties: {
                ...latestPage.database.schema.properties,
                [property]: {
                  ...latestDefinition,
                  options: optionAlreadyPresent
                    ? (latestDefinition.options ?? [])
                    : [...(latestDefinition.options ?? []), { name: option }]
                }
              }
            }
          }
        };

        forgetCachedPage(currentPage.path);
        pageRef.current = nextPage;
        setPage(nextPage);
        setMessage(`Created “${option}” in ${property}.`);
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, forgetCachedPage]
  );

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

  const refreshOpenPageDatabaseContext = useCallback(async () => {
    const currentPage = pageRef.current;

    if (!currentPage?.database) {
      return;
    }

    try {
      forgetCachedPage(currentPage.path);
      const refreshedPage = await api.openPage(currentPage.path);
      const latestPage = pageRef.current;

      if (latestPage?.path !== currentPage.path || !refreshedPage.database) {
        return;
      }

      const nextPage = { ...latestPage, database: refreshedPage.database };
      pageRef.current = nextPage;
      setPage(nextPage);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [api, forgetCachedPage]);

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
    const handleSearchShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
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

  const openDocumentLink = useCallback((path: string) => {
    const linkedNode = findNodeByOpenPath(tree, path);
    if (!linkedNode) {
      setMessage(`Document link not found: ${path}`);
      return;
    }
    void openNode(linkedNode);
  }, [openNode, tree]);

  const uploadEditorAsset = useCallback(async (file: File): Promise<string> => {
    const result = await api.uploadAsset(file.name, file);
    setMessage(`Uploaded ${result.fileName}`);
    return result.path;
  }, [api]);

  useEffect(() => {
    if (!tree || !workspaceRootPath || restoredWorkspaceRef.current === workspaceRootPath) {
      return;
    }

    restoredWorkspaceRef.current = workspaceRootPath;
    const savedPage = readLastOpenedPage(window.localStorage, workspaceRootPath);

    if (!savedPage) {
      return;
    }

    const node = findWorkspaceNode(tree, savedPage.nodePath);

    if (!node || openPathForNode(node) !== savedPage.openPath) {
      clearLastOpenedPage(window.localStorage, workspaceRootPath);
      return;
    }

    void openNode(node);
  }, [openNode, tree, workspaceRootPath]);

  useEffect(() => {
    if (!workspaceRootPath || !page || !selection || selection.openPath !== page.path) {
      return;
    }

    writeLastOpenedPage(window.localStorage, workspaceRootPath, {
      nodePath: selection.nodePath,
      openPath: page.path,
      kind: selection.kind
    });
  }, [page, selection, workspaceRootPath]);

  const refreshAfterMutation = useCallback(
    async (openPath?: string | null) => {
      await loadTree();

      if (openPath) {
        const nextPage = await loadPage(openPath);
        setPage(nextPage);
        setDraftBody(nextPage.markdownBody);
        setSelection({
          nodePath: openPath,
          openPath: nextPage.path,
          kind: pageKindToNodeKind(nextPage.kind)
        });
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

  const createDatabase = useCallback(async (parentPath: string, name: string) => {
    try {
      const result = await api.createDatabase({ parentPath, name });
      clearPageLoadCache();
      await loadTree();
      const nextPage = await loadPage(result.path);
      setPage(nextPage);
      setDraftBody(nextPage.markdownBody);
      setSelection({ nodePath: result.path, openPath: nextPage.path, kind: "database" });
      setMessage(`Created ${result.path}`);
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      throw error;
    }
  }, [api, clearPageLoadCache, loadPage, loadTree]);

  const openRecordPath = useCallback(async (recordPath: string) => {
    try {
      const nextPage = await loadPage(recordPath);
      setPage(nextPage);
      setDraftBody(nextPage.markdownBody);
      setSelection({ nodePath: recordPath, openPath: nextPage.path, kind: "page" });
      setSaveState("idle");
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
    }
  }, [loadPage]);

  const openSearchResult = useCallback(async (item: SearchWorkspaceResultItem) => {
    try {
      const nextPage = await loadPage(item.path);
      setPage(nextPage);
      setDraftBody(nextPage.markdownBody);
      setSelection({
        nodePath: item.kind === "page" ? item.path : parentPathForPage(item.path),
        openPath: nextPage.path,
        kind: item.kind
      });
      setSaveState("idle");
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
    }
  }, [loadPage]);

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
          clearLastOpenedPage(window.localStorage, workspaceRootPath);
        }

        setMessage(`Deleted ${node.path}`);
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        setSaveState("error");
        return false;
      }
    },
    [api, clearPageLoadCache, loadTree, workspaceRootPath]
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
    const frontmatter = page.frontmatter;
    const savingRevision = editorRevisionRef.current;
    const saveReason = saveReasonRef.current;

    try {
      const result: SavePageResult = await api.savePage({
        path: page.path,
        baseVersion: page.version,
        frontmatter,
        markdownBody,
        reason: saveReason
      });

      if (pageRef.current?.path !== page.path) {
        return;
      }

      if (result.status === "conflict") {
        forgetCachedPage(page.path);
        setSaveState("conflict");
        setMessage("This page changed on disk. Reopen it from the sidebar before editing again.");
        return;
      }

      const savedPage = {
        ...page,
        frontmatter,
        markdownBody,
        version: result.version,
        contentHash: result.contentHash
      };

      cacheResolvedPage(savedPage);

      if (editorRevisionRef.current === savingRevision) {
        pageRef.current = savedPage;
        setPage(savedPage);
        editorRef.current?.markClean(markdownBody);
        setDraftBody(markdownBody);
        setSaveState("saved");
      } else {
        const currentPage = pageRef.current;
        if (currentPage?.path === page.path) {
          const dirtyPage = {
            ...currentPage,
            version: result.version,
            contentHash: result.contentHash
          };
          pageRef.current = dirtyPage;
          setPage(dirtyPage);
        }
        setSaveState("dirty");
      }

      await loadTree();
    } catch (error) {
      if (pageRef.current?.path !== page.path) {
        return;
      }

      setSaveState("error");
      setMessage(errorMessage(error));
    }
  }, [api, cacheResolvedPage, forgetCachedPage, getCurrentDraftBody, loadTree, page]);

  const refreshOpenPage = useCallback(async () => {
    const currentPage = pageRef.current;

    if (!currentPage) {
      return;
    }

    forgetCachedPage(currentPage.path);
    const nextPage = await loadPage(currentPage.path);
    setPage(nextPage);
    setDraftBody(nextPage.markdownBody);
    setSaveState("idle");
  }, [forgetCachedPage, loadPage]);

  useEffect(() => {
    if (!page || saveState !== "dirty") {
      return;
    }

    const timeout = window.setTimeout(() => {
      void savePage();
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [editorRevision, page, savePage, saveState]);

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
        setMessage("This page changed elsewhere. Reopen it from the sidebar before editing again.");
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
        clearLastOpenedPage(window.localStorage, workspaceRootPath);
        setSaveState("idle");
        setMessage("The open item was deleted.");
      }
    },
    [clearPageLoadCache, loadTree, workspaceRootPath]
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

      if (event.name === "database.recordsChanged" || event.name === "database.schemaChanged") {
        setDatabaseRefreshRevision((current) => current + 1);
      }

      if (
        event.name === "database.schemaChanged" &&
        pageRef.current?.database?.databasePath === event.path
      ) {
        void refreshOpenPageDatabaseContext();
      }
    });
  }, [api, clearPageLoadCache, handleDeletedEvent, handleMovedEvent, handlePageChangedEvent, loadTree, refreshOpenPageDatabaseContext]);

  return (
    <main className="relative flex h-screen max-h-screen min-h-0 overflow-hidden bg-background text-foreground">
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
            "z-40 h-screen min-h-0 shrink-0 bg-background",
            isNarrow
              ? [
                  "fixed inset-y-0 left-0 transform-gpu shadow-xl transition-transform duration-200 ease-out",
                  sidebarCollapsed ? "pointer-events-none -translate-x-full" : "translate-x-0"
                ]
              : "sticky top-0"
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
            onCreateDatabase={createDatabase}
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
          "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[filter] duration-200 ease-out",
          blurContent ? "blur-sm" : "blur-0"
        )}
      >
        <div className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-2.5">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {page ? displayPath(page.path) : "Select a Markdown page"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto shrink-0"
            onClick={() => setSearchOpen(true)}
          >
            <MagnifyingGlass size={16} />
            Search
          </Button>
          {page && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => setRevisionHistoryOpen(true)}
            >
              <ClockCounterClockwise size={16} />
              History
            </Button>
          )}
        </div>

        {message && (
          <div
            className={cn(
              "mx-4 mt-3 shrink-0 rounded-md border px-3 py-2 text-sm",
              saveState === "conflict" || saveState === "error" || loadState === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted"
            )}
          >
            {message}
          </div>
        )}

        {page ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <article className={cn(
              "mx-auto w-full px-6 pb-24 pt-12 sm:px-10 sm:pt-16 lg:px-12",
              page.kind === "database" ? "max-w-[1120px]" : "max-w-[820px]"
            )}>
              <h1 className="break-words text-4xl font-bold leading-tight tracking-tight sm:text-[2.75rem]">
                {pageTitle}
              </h1>

              {page.kind === "database" ? (
                <DatabaseView
                  api={api}
                  databasePath={parentPathForPage(page.path)}
                  refreshRevision={databaseRefreshRevision}
                  onOpenRecord={(recordPath) => void openRecordPath(recordPath)}
                  onMessage={setMessage}
                />
              ) : (
                <PageProperties
                  frontmatter={page.frontmatter}
                  database={page.database}
                  disabled={saveState === "conflict"}
                  onChange={updatePageFrontmatter}
                  onCreateDatabaseOption={createOpenPageDatabaseOption}
                />
              )}

              <div className={page.kind === "database" || Object.keys(page.frontmatter).length > 0 ? "mt-10" : "mt-8"}>
                <Suspense fallback={<p className="py-4 text-sm text-muted-foreground">Loading editor…</p>}>
                  <RumiBlockEditor
                    ref={editorRef}
                    api={api}
                    documentKey={page.path}
                    markdown={draftBody}
                    documents={editorDocuments}
                    onOpenDocument={openDocumentLink}
                    onUploadAsset={uploadEditorAsset}
                    onMessage={setMessage}
                    onDirty={() => markPageDirty("editor-autosave")}
                  />
                </Suspense>
              </div>
            </article>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center p-8 text-muted-foreground">
            <p>Open a page from the sidebar.</p>
          </div>
        )}
      </section>

      {page && (
        <RevisionHistoryDialog
          api={api}
          path={page.path}
          open={revisionHistoryOpen}
          dirty={saveState === "dirty" || saveState === "saving"}
          currentMarkdown={getCurrentDraftBody}
          onOpenChange={setRevisionHistoryOpen}
          onRestored={refreshOpenPage}
          onMessage={setMessage}
        />
      )}
      <SearchDialog
        api={api}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onOpenItem={(item) => void openSearchResult(item)}
        onMessage={setMessage}
      />
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

function collectEditorDocuments(tree: WorkspaceNode | null): RumiDocumentLink[] {
  if (!tree) return [];
  const documents: RumiDocumentLink[] = [];

  const visit = (node: WorkspaceNode) => {
    const path = openPathForNode(node);
    if (path) {
      documents.push({
        path,
        title: stripMarkdownExtension(node.name)
      });
    }
    node.children?.forEach(visit);
  };

  visit(tree);
  return documents.sort((left, right) => left.title.localeCompare(right.title));
}

function findNodeByOpenPath(tree: WorkspaceNode | null, requestedPath: string): WorkspaceNode | null {
  if (!tree) return null;
  const normalized = requestedPath.replace(/^\.\//u, "").split("#", 1)[0] ?? requestedPath;
  if (openPathForNode(tree) === normalized || tree.path === normalized) return tree;

  for (const child of tree.children ?? []) {
    const match = findNodeByOpenPath(child, normalized);
    if (match) return match;
  }
  return null;
}

function displayPath(path: string): string {
  return path
    .split("/")
    .map(stripMarkdownExtension)
    .join(" / ");
}

function parentPathForPage(pagePath: string): string {
  const parts = pagePath.split("/");
  parts.pop();
  return parts.join("/");
}

function stripMarkdownExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

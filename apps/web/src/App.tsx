import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { SidebarSimple } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { RumiApiClient } from "@rumi/api-client";
import {
  parseMarkdownFile,
  rewriteMarkdownReferences,
  serializeMarkdownFile
} from "@rumi/markdown";
import { cleanWorkspaceName } from "@rumi/workspace-format";
import type {
  DatabasePropertyOptionColor,
  DatabasePropertyType,
  PageDocument,
  RumiEvent,
  SavePageReason,
  SavePageResult,
  SearchWorkspaceResultItem,
  TrashItem,
  WorkspaceNode
} from "@rumi/contracts";
import type {
  RumiBlockEditorHandle,
  RumiDocumentLink
} from "./components/editor/RumiBlockEditor";
import { DatabaseView } from "./components/database/DatabaseView";
import {
  addDatabasePropertyToPrimaryView,
  databasePropertyDefinition
} from "./components/database/databaseSchema";
import { PageProperties } from "./components/editor/PageProperties";
import { EditablePageTitle } from "./components/editor/EditablePageTitle";
import type { EditableTitleSplitContext } from "./components/editor/EditablePageTitle";
import { randomDatabaseOptionColor } from "./components/editor/DatabaseOptionPill";
import { RevisionHistoryDialog } from "./components/editor/RevisionHistoryDialog";
import { emptyPageTitle, pageTitleFromPath } from "./components/editor/pagePresentation";
import { WorkspaceHeader } from "./components/layout/WorkspaceHeader";
import { Sidebar } from "./components/sidebar/Sidebar";
import type { SidebarSelection } from "./components/sidebar/Sidebar";
import { Button } from "./components/ui/button";
import { SearchDialog } from "./components/search/SearchDialog";
import { TrashView } from "./components/trash/TrashView";
import {
  clearLastOpenedPage,
  findWorkspaceNode,
  readLastOpenedPage,
  writeLastOpenedPage
} from "./lib/lastOpenedPage";
import {
  findWorkspaceNodeForRoute,
  parseWorkspaceRoute,
  workspaceUrlForNode
} from "./lib/workspaceRoute";
import { resolveWorkspaceDocumentLink } from "./lib/workspaceDocumentLink";
import { cn } from "./lib/utils";

const RumiBlockEditor = lazy(async () => {
  const module = await import("./components/editor/RumiBlockEditor");
  return { default: module.RumiBlockEditor };
});

type LoadState = "idle" | "loading" | "error";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
type PageRenameIntent = {
  previousNodePath: string;
  expectedNodePath: string;
  previousPagePath: string;
  expectedPagePath: string;
};
type PageTitleUndoAction = {
  kind: "rename" | "split";
  previousTitle: string;
  currentPagePath: string;
  editorRevision: number;
  editorDocumentRevision: number;
  leadingContent?: string;
};
type PageTitleEditRequest = {
  id: number;
  path: string;
  caretOffset: number;
};

const SIDEBAR_WIDTH_KEY = "rumi-new-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "rumi-new-sidebar-collapsed";
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const MOBILE_SIDEBAR_TRANSITION_MS = 200;
const AUTOSAVE_DELAY_MS = 800;

function waitForEditorFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

export function App(): ReactElement {
  const api = useMemo(() => new RumiApiClient(), []);
  const [workspaceName, setWorkspaceName] = useState("Rumi");
  const [workspaceRootPath, setWorkspaceRootPath] = useState("");
  const [tree, setTree] = useState<WorkspaceNode | null>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashLoadState, setTrashLoadState] = useState<LoadState>("idle");
  const [restoringTrashId, setRestoringTrashId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SidebarSelection | null>(null);
  const [page, setPage] = useState<PageDocument | null>(null);
  const [pageTitleOverride, setPageTitleOverride] = useState<{ path: string; title: string } | null>(null);
  const [pageRenamePending, setPageRenamePending] = useState(false);
  const [pageTitleEditRequest, setPageTitleEditRequest] = useState<PageTitleEditRequest | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [editorRevision, setEditorRevision] = useState(0);
  const [databaseRefreshRevision, setDatabaseRefreshRevision] = useState(0);
  const [revisionHistoryOpen, setRevisionHistoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [routeSyncReady, setRouteSyncReady] = useState(false);
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
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const pageRenameIntentRef = useRef<PageRenameIntent | null>(null);
  const pageTitleUndoRef = useRef<PageTitleUndoAction | null>(null);
  const pageTitleUndoInFlightRef = useRef(false);
  const pageTitleEditRequestIdRef = useRef(0);
  const deferredReferenceRepairRef = useRef<RumiEvent | null>(null);
  const pendingHistoryActionRef = useRef<"push" | "replace">("replace");
  const pageLoadCacheRef = useRef<Map<string, Promise<PageDocument>>>(new Map());
  const pageLoadCacheGenerationRef = useRef(0);
  const openRequestIdRef = useRef(0);
  const restoredWorkspaceRef = useRef<string | null>(null);
  const isNarrow = viewportWidth < 768;
  const visibleSidebarWidth = Math.min(sidebarWidth, isNarrow ? Math.max(260, Math.floor(viewportWidth * 0.86)) : MAX_SIDEBAR_WIDTH);
  const renderSidebar = !sidebarCollapsed || (isNarrow && sidebarMounted);
  const blurContent = isNarrow && !sidebarCollapsed;
  const pageTitle = page
    ? selection?.kind === "workspace"
      ? workspaceName
      : pageTitleOverride?.path === page.path
      ? pageTitleOverride.title
      : pageTitleFromPath(page.path, page.kind)
    : null;
  const editorDocuments = useMemo(() => collectEditorDocuments(tree), [tree]);

  useEffect(() => {
    document.title = trashOpen ? "Trash" : pageTitle ?? "Rumi";
  }, [pageTitle, trashOpen]);

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

  const loadTrash = useCallback(async () => {
    setTrashLoadState("loading");
    try {
      const result = await api.listTrash();
      setTrashItems(result.items);
      setTrashLoadState("idle");
    } catch (error) {
      setTrashLoadState("error");
      setMessage(errorMessage(error));
    }
  }, [api]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

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
    saveStateRef.current = "dirty";
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

  const createOpenPageDatabaseProperty = useCallback(
    async (name: string, type: DatabasePropertyType): Promise<boolean> => {
      const currentPage = pageRef.current;
      const database = currentPage?.database;
      const property = name.trim();

      if (
        !currentPage ||
        !database ||
        !property ||
        database.schema.properties[property] ||
        database.schema.unsupportedProperties.includes(property)
      ) {
        return false;
      }

      const properties = {
        ...database.schema.properties,
        [property]: databasePropertyDefinition(type)
      };
      const views = addDatabasePropertyToPrimaryView(database.schema.views, property);

      try {
        const result = await api.updateDatabaseSchema({
          databasePath: database.databasePath,
          baseVersion: database.schemaVersion,
          properties,
          views
        });

        if (result.status === "conflict") {
          forgetCachedPage(currentPage.path);
          setMessage("The database schema changed elsewhere. Reopen this record and try again.");
          return false;
        }

        const latestPage = pageRef.current;
        if (latestPage?.path !== currentPage.path || !latestPage.database) return false;

        const nextPage: PageDocument = {
          ...latestPage,
          database: {
            ...latestPage.database,
            schemaVersion: result.version,
            schema: {
              ...latestPage.database.schema,
              properties,
              views
            }
          }
        };

        forgetCachedPage(currentPage.path);
        pageRef.current = nextPage;
        setPage(nextPage);
        setMessage("");
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, forgetCachedPage]
  );

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

      const color = randomDatabaseOptionColor();

      try {
        const result = await api.createDatabasePropertyOption({
          databasePath: database.databasePath,
          baseVersion: database.schemaVersion,
          property,
          option,
          color
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
                    : [...(latestDefinition.options ?? []), { name: option, color }]
                }
              }
            }
          }
        };

        forgetCachedPage(currentPage.path);
        pageRef.current = nextPage;
        setPage(nextPage);
        setMessage("");
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, forgetCachedPage]
  );

  const updateOpenPageDatabaseOption = useCallback(
    async (
      property: string,
      option: string,
      update:
        | { action: "rename"; newName: string }
        | { action: "change-color"; color: DatabasePropertyOptionColor }
        | { action: "delete" }
    ): Promise<boolean> => {
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
        const result = await api.updateDatabasePropertyOption({
          databasePath: database.databasePath,
          baseVersion: database.schemaVersion,
          property,
          option,
          ...update
        });

        if (result.status === "conflict") {
          forgetCachedPage(currentPage.path);
          setMessage("The database options changed elsewhere. Reopen this record and try again.");
          return false;
        }

        forgetCachedPage(currentPage.path);
        const nextPage = await api.openPage(currentPage.path);
        if (pageRef.current?.path !== currentPage.path) return false;
        pageRef.current = nextPage;
        setPage(nextPage);
        cacheResolvedPage(nextPage);
        setMessage("");
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, cacheResolvedPage, forgetCachedPage]
  );

  const updateOpenPageDatabaseProperty = useCallback(
    async (
      property: string,
      update:
        | { action: "rename"; newName: string }
        | { action: "change-type"; type: DatabasePropertyType }
        | { action: "delete" }
    ): Promise<boolean> => {
      const currentPage = pageRef.current;
      const database = currentPage?.database;
      if (!currentPage || !database || !database.schema.properties[property]) return false;

      try {
        const requestBase = {
          databasePath: database.databasePath,
          baseVersion: database.schemaVersion,
          property
        };
        const result = update.action === "rename"
          ? await api.renameDatabaseProperty({ ...requestBase, newName: update.newName })
          : update.action === "change-type"
            ? await api.changeDatabasePropertyType({ ...requestBase, type: update.type })
            : await api.deleteDatabaseProperty(requestBase);

        if (result.status === "conflict") {
          forgetCachedPage(currentPage.path);
          setMessage("The database schema changed elsewhere. Reopen this record and try again.");
          return false;
        }

        forgetCachedPage(currentPage.path);
        const nextPage = await api.openPage(currentPage.path);
        if (pageRef.current?.path !== currentPage.path) return false;
        pageRef.current = nextPage;
        setPage(nextPage);
        cacheResolvedPage(nextPage);
        setMessage("");
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, cacheResolvedPage, forgetCachedPage]
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
      if (
        !event.repeat &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        setSearchOpen((open) => !open);
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
    async (node: WorkspaceNode, historyAction: "push" | "replace" = "push") => {
      const requestId = ++openRequestIdRef.current;
      const openPath = openPathForNode(node);
      pendingHistoryActionRef.current = historyAction;
      setSelection({ nodePath: node.path, openPath, kind: node.kind });
      setSaveState("idle");
      setMessage("");
      setTrashOpen(false);

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
    const linkedNode = resolveWorkspaceDocumentLink(tree, path, pageRef.current?.path);
    if (!linkedNode) {
      setMessage(`Document link not found: ${path}`);
      return;
    }
    void openNode(linkedNode);
  }, [openNode, tree]);

  const uploadEditorAsset = useCallback(async (file: File): Promise<string> => {
    const result = await api.uploadAsset(file.name, file);
    setMessage("");
    return result.path;
  }, [api]);

  useEffect(() => {
    if (!tree || !workspaceRootPath || restoredWorkspaceRef.current === workspaceRootPath) {
      return;
    }

    restoredWorkspaceRef.current = workspaceRootPath;
    const route = parseWorkspaceRoute(window.location.pathname);

    if (route?.view === "trash") {
      pendingHistoryActionRef.current = "replace";
      setTrashOpen(true);
      setRouteSyncReady(true);
      void loadTrash();
      return;
    }

    if (route?.view === "node") {
      const routedNode = findWorkspaceNodeForRoute(tree, route);
      if (routedNode) {
        setRouteSyncReady(true);
        void openNode(routedNode, "replace");
        return;
      }

      pendingHistoryActionRef.current = "replace";
      setMessage(`No workspace item matches ${window.location.pathname}.`);
      setRouteSyncReady(true);
      return;
    }

    if (route?.view === "home") {
      setRouteSyncReady(true);
      void openNode(tree, "replace");
      return;
    }

    if (!route) {
      pendingHistoryActionRef.current = "replace";
      setMessage(`Unsupported workspace URL: ${window.location.pathname}`);
      setRouteSyncReady(true);
      return;
    }

    const savedPage = readLastOpenedPage(window.localStorage, workspaceRootPath);

    if (!savedPage) {
      setRouteSyncReady(true);
      return;
    }

    const node = findWorkspaceNode(tree, savedPage.nodePath);

    if (!node || openPathForNode(node) !== savedPage.openPath) {
      clearLastOpenedPage(window.localStorage, workspaceRootPath);
      setRouteSyncReady(true);
      return;
    }

    setRouteSyncReady(true);
    void openNode(node, "replace");
  }, [loadTrash, openNode, tree, workspaceRootPath]);

  useEffect(() => {
    if (!routeSyncReady || !tree) return;

    const handlePopState = () => {
      const route = parseWorkspaceRoute(window.location.pathname);
      pendingHistoryActionRef.current = "replace";

      if (route?.view === "trash") {
        setTrashOpen(true);
        setMessage("");
        void loadTrash();
        return;
      }

      if (route?.view === "node") {
        const routedNode = findWorkspaceNodeForRoute(tree, route);
        if (routedNode) {
          void openNode(routedNode, "replace");
          return;
        }
      }

      if (route?.view === "home") {
        void openNode(tree, "replace");
        return;
      }

      openRequestIdRef.current += 1;
      setTrashOpen(false);
      setPage(null);
      setDraftBody("");
      setSelection(null);
      setSaveState("idle");
      window.history.replaceState(null, "", "/");
      setMessage("That workspace URL no longer matches an item.");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [loadTrash, openNode, routeSyncReady, tree]);

  useEffect(() => {
    if (!routeSyncReady) return;
    const nextUrl = trashOpen
      ? "/trash"
      : selection
        ? workspaceUrlForNode({ path: selection.nodePath, kind: selection.kind }, tree)
        : "/";

    if (window.location.pathname === nextUrl) {
      pendingHistoryActionRef.current = "replace";
      return;
    }

    const action = pendingHistoryActionRef.current;
    window.history[action === "push" ? "pushState" : "replaceState"](null, "", nextUrl);
    pendingHistoryActionRef.current = "replace";
  }, [routeSyncReady, selection, trashOpen, tree]);

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
        pendingHistoryActionRef.current = "push";
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
        markdownBody: ""
      });
      clearPageLoadCache();
      await refreshAfterMutation(result.path);
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      throw error;
    }
  }, [api, clearPageLoadCache, refreshAfterMutation]);

  const createFolder = useCallback(async (parentPath: string, name: string) => {
    try {
      const result = await api.createFolder({ parentPath, name, markdownBody: "" });
      clearPageLoadCache();
      await refreshAfterMutation(result.path);
      setMessage("");
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
      pendingHistoryActionRef.current = "push";
      setPage(nextPage);
      setDraftBody(nextPage.markdownBody);
      setSelection({ nodePath: result.path, openPath: nextPage.path, kind: "database" });
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      throw error;
    }
  }, [api, clearPageLoadCache, loadPage, loadTree]);

  const openRecordPath = useCallback(async (recordPath: string) => {
    try {
      setTrashOpen(false);
      const nextPage = await loadPage(recordPath);
      pendingHistoryActionRef.current = "push";
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
      setTrashOpen(false);
      const nextPage = await loadPage(item.path);
      pendingHistoryActionRef.current = "push";
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
          pendingHistoryActionRef.current = "replace";
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

        setMessage("");
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
        await Promise.all([loadTree(), loadTrash()]);

        const currentSelection = selectionRef.current;

        if (currentSelection && isSameOrDescendant(currentSelection.nodePath, node.path)) {
          pendingHistoryActionRef.current = "replace";
          setPage(null);
          setDraftBody("");
          setSelection(null);
          clearLastOpenedPage(window.localStorage, workspaceRootPath);
        }

        setMessage("");
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        setSaveState("error");
        return false;
      }
    },
    [api, clearPageLoadCache, loadTrash, loadTree, workspaceRootPath]
  );

  const openTrash = useCallback(() => {
    pendingHistoryActionRef.current = "push";
    setTrashOpen(true);
    setMessage("");
    void loadTrash();
    if (isNarrow) setSidebarCollapsedState(true, setSidebarCollapsed);
  }, [isNarrow, loadTrash]);

  const restoreTrashItem = useCallback(async (item: TrashItem): Promise<void> => {
    if (restoringTrashId) return;
    setRestoringTrashId(item.id);
    try {
      await api.restoreTrashItem({ id: item.id });
      clearPageLoadCache();
      await Promise.all([loadTree(), loadTrash()]);
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
    } finally {
      setRestoringTrashId(null);
    }
  }, [api, clearPageLoadCache, loadTrash, loadTree, restoringTrashId]);

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
          pendingHistoryActionRef.current = "replace";
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

        setMessage("");
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        setSaveState("error");
        return false;
      }
    },
    [api, clearPageLoadCache, getCurrentDraftBody, loadPage, loadTree]
  );

  const savePage = useCallback((): Promise<boolean> => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    if (pageRenameIntentRef.current) return Promise.resolve(false);

    const savingPage = pageRef.current;
    if (!savingPage) return Promise.resolve(false);

    saveStateRef.current = "saving";
    setSaveState("saving");
    setMessage("");

    const markdownBody = getCurrentDraftBody();
    const frontmatter = savingPage.frontmatter;
    const savingRevision = editorRevisionRef.current;
    const saveReason = saveReasonRef.current;
    let task: Promise<boolean>;

    task = (async () => {
      try {
        const result: SavePageResult = await api.savePage({
          path: savingPage.path,
          baseVersion: savingPage.version,
          frontmatter,
          markdownBody,
          reason: saveReason
        });

        if (pageRef.current?.path !== savingPage.path) return false;

        if (result.status === "conflict") {
          forgetCachedPage(savingPage.path);
          saveStateRef.current = "conflict";
          setSaveState("conflict");
          setMessage("This page changed on disk. Reopen it from the sidebar before editing again.");
          return false;
        }

        const savedPage = {
          ...savingPage,
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
          saveStateRef.current = "saved";
          setSaveState("saved");
        } else {
          const currentPage = pageRef.current;
          if (currentPage?.path === savingPage.path) {
            const dirtyPage = {
              ...currentPage,
              version: result.version,
              contentHash: result.contentHash
            };
            pageRef.current = dirtyPage;
            setPage(dirtyPage);
          }
          saveStateRef.current = "dirty";
          setSaveState("dirty");
        }

        void loadTree();
        return true;
      } catch (error) {
        if (pageRef.current?.path === savingPage.path) {
          saveStateRef.current = "error";
          setSaveState("error");
          setMessage(errorMessage(error));
        }
        return false;
      }
    })().finally(() => {
      if (saveInFlightRef.current === task) saveInFlightRef.current = null;
    });

    saveInFlightRef.current = task;
    return task;
  }, [api, cacheResolvedPage, forgetCachedPage, getCurrentDraftBody, loadTree]);

  const convertNode = useCallback(async (node: WorkspaceNode): Promise<boolean> => {
    if (node.kind !== "folder" && node.kind !== "database") return false;

    const currentSelection = selectionRef.current;
    const selectedInsideContainer = Boolean(
      currentSelection && isSameOrDescendant(currentSelection.nodePath, node.path)
    );

    if (selectedInsideContainer && saveStateRef.current === "dirty") {
      const saved = await savePage();
      if (!saved) return false;
    }

    try {
      await api.convertContainer({
        path: node.path,
        targetKind: node.kind === "folder" ? "database" : "folder"
      });
      clearPageLoadCache();
      await loadTree();

      if (currentSelection && selectedInsideContainer) {
        const nextOpenTarget = currentSelection.nodePath === node.path
          ? node.path
          : currentSelection.openPath;

        if (nextOpenTarget) {
          const nextPage = await loadPage(nextOpenTarget);
          pendingHistoryActionRef.current = "replace";
          setPage(nextPage);
          setDraftBody(nextPage.markdownBody);
          setSelection({
            nodePath: currentSelection.nodePath,
            openPath: nextPage.path,
            kind: currentSelection.nodePath === node.path
              ? node.kind === "folder" ? "database" : "folder"
              : pageKindToNodeKind(nextPage.kind)
          });
          setSaveState("idle");
        }
      }

      setMessage("");
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      return false;
    }
  }, [api, clearPageLoadCache, loadPage, loadTree, savePage]);

  const renameOpenPage = useCallback(async (requestedTitle: string): Promise<boolean> => {
    const currentPage = pageRef.current;
    const currentSelection = selectionRef.current;
    if (
      !currentPage ||
      !currentSelection ||
      currentSelection.openPath !== currentPage.path ||
      !["page", "folder", "database"].includes(currentSelection.kind) ||
      pageRenameIntentRef.current
    ) return false;

    let finalNodeName: string;
    try {
      const cleanedName = cleanWorkspaceName(requestedTitle);
      finalNodeName = currentPage.kind === "page" && !cleanedName.toLocaleLowerCase().endsWith(".md")
        ? `${cleanedName}.md`
        : cleanedName;
    } catch (error) {
      setMessage(errorMessage(error));
      return false;
    }

    const previousNodePath = currentSelection.nodePath;
    const parentPath = parentPathForPage(previousNodePath);
    const expectedNodePath = parentPath ? `${parentPath}/${finalNodeName}` : finalNodeName;
    const expectedPagePath = pagePathForRenamedNode(expectedNodePath, currentPage.kind);
    if (expectedNodePath === previousNodePath) return true;

    const intent: PageRenameIntent = {
      previousNodePath,
      expectedNodePath,
      previousPagePath: currentPage.path,
      expectedPagePath
    };
    const pendingSave = saveInFlightRef.current ??
      (saveStateRef.current === "dirty" || saveStateRef.current === "error" ? savePage() : null);
    pageRenameIntentRef.current = intent;
    deferredReferenceRepairRef.current = null;
    setPageRenamePending(true);
    setPageTitleOverride({
      path: currentPage.path,
      title: pageTitleFromPath(expectedPagePath, currentPage.kind)
    });
    setMessage("");

    try {
      if (pendingSave && !(await pendingSave)) {
        throw new Error("Rumi could not save the current edits before renaming this item.");
      }
      if (pageRef.current?.path !== intent.previousPagePath || pageRenameIntentRef.current !== intent) {
        throw new Error("The open item changed before the rename could finish.");
      }

      const result = await api.renameNode({ path: intent.previousNodePath, newName: finalNodeName });
      intent.expectedNodePath = result.path;
      intent.expectedPagePath = pagePathForRenamedNode(result.path, currentPage.kind);
      const latestPage = pageRef.current;
      if (!latestPage || latestPage.path !== intent.previousPagePath) {
        throw new Error("The item was renamed, but a different page is now open.");
      }

      const renamedPagePath = intent.expectedPagePath;
      let currentDraftBody = getCurrentDraftBody();
      let nextPage: PageDocument = {
        ...latestPage,
        path: renamedPagePath,
        markdownBody: currentDraftBody
      };
      const deferredReferenceRepair = deferredReferenceRepairRef.current as RumiEvent | null;
      if (
        deferredReferenceRepair?.path === renamedPagePath &&
        deferredReferenceRepair.referenceRepair?.previousPath === intent.previousNodePath
      ) {
        nextPage = mergeReferenceRepairIntoPage(nextPage, currentDraftBody, deferredReferenceRepair);
        currentDraftBody = nextPage.markdownBody;
      }
      deferredReferenceRepairRef.current = null;
      const latestSelection = selectionRef.current;

      clearPageLoadCache();
      pendingHistoryActionRef.current = "replace";
      pageRef.current = nextPage;
      setPage(nextPage);
      setDraftBody(currentDraftBody);
      if (latestSelection) {
        const nextSelection = {
          ...latestSelection,
          nodePath: replacePathPrefix(
            latestSelection.nodePath,
            intent.previousNodePath,
            result.path
          ),
          openPath: latestSelection.nodePath === intent.previousNodePath
            ? renamedPagePath
            : latestSelection.openPath
              ? replacePathPrefix(
                  latestSelection.openPath,
                  intent.previousNodePath,
                  result.path
                )
              : latestSelection.openPath
        };
        selectionRef.current = nextSelection;
        setSelection(nextSelection);
      }

      pageRenameIntentRef.current = null;
      setPageTitleOverride(null);
      setPageRenamePending(false);
      setMessage("");
      void loadTree();
      return true;
    } catch (error) {
      if (pageRenameIntentRef.current === intent) pageRenameIntentRef.current = null;
      deferredReferenceRepairRef.current = null;
      setPageTitleOverride(null);
      setPageRenamePending(false);
      setMessage(errorMessage(error));
      if (pageRef.current?.path === intent.previousPagePath && saveStateRef.current === "dirty") {
        void savePage();
      } else if (
        pageRef.current?.path === intent.previousPagePath &&
        saveStateRef.current !== "conflict"
      ) {
        saveStateRef.current = "error";
        setSaveState("error");
      }
      return false;
    }
  }, [api, clearPageLoadCache, getCurrentDraftBody, loadTree, savePage]);

  const renameOpenPageTitle = useCallback(async (requestedTitle: string): Promise<boolean> => {
    const currentPage = pageRef.current;
    if (!currentPage) return false;

    const previousTitle = pageTitleFromPath(currentPage.path, currentPage.kind);
    const previousPagePath = currentPage.path;
    if (!(await renameOpenPage(requestedTitle))) return false;

    const renamedPagePath = pageRef.current?.path;
    if (renamedPagePath && renamedPagePath !== previousPagePath) {
      pageTitleUndoRef.current = {
        kind: "rename",
        previousTitle,
        currentPagePath: renamedPagePath,
        editorRevision: editorRevisionRef.current,
        editorDocumentRevision: editorRef.current?.documentRevision() ?? 0
      };
    }
    return true;
  }, [renameOpenPage]);

  const insertTitleContent = useCallback(
    (documentKey: string, leadingContent: string): Promise<boolean> =>
      new Promise((resolve) => {
        let attempts = 0;

        const tryInsert = () => {
          if (pageRef.current?.path !== documentKey) {
            resolve(false);
            return;
          }

          if (editorRef.current?.prependTitleContent(leadingContent, documentKey)) {
            resolve(true);
            return;
          }

          attempts += 1;
          if (attempts >= 60) {
            resolve(false);
            return;
          }

          window.setTimeout(tryInsert, 16);
        };

        tryInsert();
      }),
    []
  );

  const splitOpenPageTitle = useCallback(
    async (
      nextTitle: string,
      leadingContent: string,
      context: EditableTitleSplitContext
    ): Promise<boolean> => {
      if (!(await renameOpenPage(nextTitle))) return false;
      const renamedPagePath = pageRef.current?.path;
      if (!renamedPagePath) return false;

      const inserted = await insertTitleContent(renamedPagePath, leadingContent);
      if (!inserted) {
        setMessage("The item was renamed, but Rumi could not create its first content line.");
        pageTitleUndoRef.current = {
          kind: "rename",
          previousTitle: context.previousTitle,
          currentPagePath: renamedPagePath,
          editorRevision: editorRevisionRef.current,
          editorDocumentRevision: editorRef.current?.documentRevision() ?? 0
        };
        return false;
      }

      await waitForEditorFrame();
      if (pageRef.current?.path !== renamedPagePath) return false;
      pageTitleUndoRef.current = {
        kind: "split",
        previousTitle: context.previousTitle,
        currentPagePath: renamedPagePath,
        editorRevision: editorRevisionRef.current,
        editorDocumentRevision: editorRef.current?.documentRevision() ?? 0,
        leadingContent
      };
      return true;
    },
    [insertTitleContent, renameOpenPage]
  );

  const undoOpenPageTitle = useCallback(async (): Promise<boolean> => {
    const action = pageTitleUndoRef.current;
    if (
      !action ||
      pageTitleUndoInFlightRef.current ||
      pageRef.current?.path !== action.currentPagePath
    ) return false;

    pageTitleUndoInFlightRef.current = true;
    let removedLeadingContent = false;

    try {
      if (action.kind === "split") {
        const leadingContent = action.leadingContent ?? "";
        if (!editorRef.current?.canUndoTitleContent(leadingContent, action.currentPagePath)) {
          return false;
        }
        if (!editorRef.current.undoTitleContent(leadingContent, action.currentPagePath)) {
          return false;
        }
        removedLeadingContent = true;
        await waitForEditorFrame();
      }

      if (!(await renameOpenPage(action.previousTitle))) {
        if (removedLeadingContent && pageRef.current?.path === action.currentPagePath) {
          editorRef.current?.prependTitleContent(
            action.leadingContent ?? "",
            action.currentPagePath
          );
        }
        return false;
      }

      pageTitleUndoRef.current = null;
      const restoredPage = pageRef.current;
      if (restoredPage) {
        pageTitleEditRequestIdRef.current += 1;
        setPageTitleEditRequest({
          id: pageTitleEditRequestIdRef.current,
          path: restoredPage.path,
          caretOffset: action.previousTitle.length
        });
      }
      return true;
    } finally {
      pageTitleUndoInFlightRef.current = false;
    }
  }, [renameOpenPage]);

  useEffect(() => {
    const handlePageTitleUndo = (event: globalThis.KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLocaleLowerCase() !== "z"
      ) return;

      const action = pageTitleUndoRef.current;
      if (!action || pageTitleUndoInFlightRef.current) return;
      if (pageRef.current?.path !== action.currentPagePath) {
        pageTitleUndoRef.current = null;
        return;
      }

      const activeElement = document.activeElement;
      const editingTextField =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement &&
          activeElement.isContentEditable &&
          !activeElement.closest(".prosemirror-editor"));
      if (editingTextField) return;

      if (action.kind === "rename") {
        if (
          editorRevisionRef.current !== action.editorRevision ||
          editorRef.current?.documentRevision() !== action.editorDocumentRevision
        ) {
          pageTitleUndoRef.current = null;
          return;
        }
      } else if (
        !editorRef.current?.canUndoTitleContent(
          action.leadingContent ?? "",
          action.currentPagePath
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void undoOpenPageTitle();
    };

    document.addEventListener("keydown", handlePageTitleUndo, true);
    return () => document.removeEventListener("keydown", handlePageTitleUndo, true);
  }, [undoOpenPageTitle]);

  useEffect(() => {
    const action = pageTitleUndoRef.current;
    if (action && page?.path !== action.currentPagePath && !pageRenameIntentRef.current) {
      pageTitleUndoRef.current = null;
    }
  }, [page?.path]);

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
      void loadTree();

      const currentPage = pageRef.current;

      const renameIntent = pageRenameIntentRef.current;
      if (
        currentPage &&
        renameIntent &&
        currentPage.path === renameIntent.previousPagePath &&
        event.changedBy === "reference-repair" &&
        event.referenceRepair?.previousPath === renameIntent.previousNodePath
      ) {
        renameIntent.expectedPagePath = event.path;
        deferredReferenceRepairRef.current = event;
        return;
      }

      if (!currentPage || currentPage.path !== event.path) {
        return;
      }

      if (event.version && currentPage.version === event.version) {
        return;
      }

      if (saveStateRef.current === "dirty") {
        if (event.changedBy === "reference-repair" && event.referenceRepair && event.version) {
          const mergedPage = mergeReferenceRepairIntoPage(currentPage, getCurrentDraftBody(), event);
          pageRef.current = mergedPage;
          setPage(mergedPage);
          setDraftBody(mergedPage.markdownBody);
          return;
        }

        saveStateRef.current = "conflict";
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
        setMessage("");
      } catch (error) {
        setSaveState("error");
        setMessage(errorMessage(error));
      }
    },
    [forgetCachedPage, getCurrentDraftBody, loadPage, loadTree]
  );

  const handleMovedEvent = useCallback(
    async (event: RumiEvent) => {
      if (!event.path || !event.previousPath) {
        clearPageLoadCache();
        await loadTree();
        return;
      }

      const renameIntent = pageRenameIntentRef.current;
      if (
        renameIntent &&
        event.previousPath === renameIntent.previousNodePath
      ) {
        renameIntent.expectedNodePath = event.path;
        const currentPage = pageRef.current;
        if (currentPage) {
          renameIntent.expectedPagePath = pagePathForRenamedNode(event.path, currentPage.kind);
        }
        clearPageLoadCache();
        void loadTree();
        return;
      }

      clearPageLoadCache();
      await loadTree();

      const currentSelection = selectionRef.current;

      if (!currentSelection || !isSameOrDescendant(currentSelection.nodePath, event.previousPath)) {
        return;
      }

      pendingHistoryActionRef.current = "replace";

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
        await Promise.all([loadTree(), loadTrash()]);
        return;
      }

      clearPageLoadCache();
      await Promise.all([loadTree(), loadTrash()]);

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
    [clearPageLoadCache, loadTrash, loadTree, workspaceRootPath]
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
        if (event.name === "workspace.treeChanged") void loadTrash();
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
  }, [api, clearPageLoadCache, handleDeletedEvent, handleMovedEvent, handlePageChangedEvent, loadTrash, loadTree, refreshOpenPageDatabaseContext]);

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
            selection={trashOpen ? null : selection}
            loadState={loadState}
            trashCount={trashItems.length}
            trashOpen={trashOpen}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsedState(!sidebarCollapsed, setSidebarCollapsed)}
            onPrefetchNode={prefetchNode}
            onOpenNode={(node) => void openNode(node)}
            onCreatePage={createPage}
            onCreateFolder={createFolder}
            onCreateDatabase={createDatabase}
            onRenameNode={renameNode}
            onMoveNode={moveNode}
            onConvertNode={convertNode}
            onDeleteNode={deleteNode}
            onOpenTrash={openTrash}
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
        <WorkspaceHeader
          workspaceName={workspaceName}
          tree={tree}
          selection={selection}
          trashOpen={trashOpen}
          wide={trashOpen || page?.kind === "database"}
          hasOpenPage={Boolean(page && !trashOpen)}
          onNavigate={(node) => void openNode(node)}
          onToggleSearch={() => setSearchOpen((open) => !open)}
          onMoveNode={moveNode}
          onMoveToTrash={deleteNode}
          onSeeRevisions={() => setRevisionHistoryOpen(true)}
        />

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

        {trashOpen ? (
          <TrashView
            items={trashItems}
            loadState={trashLoadState}
            restoringId={restoringTrashId}
            onRestore={restoreTrashItem}
          />
        ) : page ? (
          <div className="min-h-0 flex-1 overflow-y-auto" data-rumi-editor-canvas="">
            <article className={cn(
              "mx-auto w-full max-w-[820px] px-6 pb-24 pt-12 sm:px-10 sm:pt-16 lg:px-12"
            )}>
              <div className="contents" data-rumi-area-selection-exclude="">
                <EditablePageTitle
                  title={pageTitle ?? ""}
                  editable={Boolean(
                    selection &&
                    selection.kind !== "workspace" &&
                    selection.openPath === page.path &&
                    saveState !== "conflict"
                  )}
                  renaming={pageRenamePending}
                  emptyTitle={emptyPageTitle(page.kind)}
                  {...(pageTitleEditRequest?.path === page.path
                    ? { editRequest: pageTitleEditRequest }
                    : {})}
                  onRename={renameOpenPageTitle}
                  onSplit={splitOpenPageTitle}
                />

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
                    onCreateDatabaseProperty={createOpenPageDatabaseProperty}
                    onCreateDatabaseOption={createOpenPageDatabaseOption}
                    onChangeDatabaseOptionColor={(property, option, color) =>
                      updateOpenPageDatabaseOption(property, option, { action: "change-color", color })
                    }
                    onRenameDatabaseOption={(property, option, newName) =>
                      updateOpenPageDatabaseOption(property, option, { action: "rename", newName })
                    }
                    onDeleteDatabaseOption={(property, option) =>
                      updateOpenPageDatabaseOption(property, option, { action: "delete" })
                    }
                    onRenameDatabaseProperty={(property, newName) =>
                      updateOpenPageDatabaseProperty(property, { action: "rename", newName })
                    }
                    onChangeDatabasePropertyType={(property, type) =>
                      updateOpenPageDatabaseProperty(property, { action: "change-type", type })
                    }
                    onDeleteDatabaseProperty={(property) =>
                      updateOpenPageDatabaseProperty(property, { action: "delete" })
                    }
                  />
                )}
              </div>

              <div className={page.kind === "database" || Object.keys(page.frontmatter).length > 0 ? "mt-10" : "mt-8"}>
                <Suspense fallback={<p className="py-4 text-sm text-muted-foreground">Loading editor…</p>}>
                  <RumiBlockEditor
                    ref={editorRef}
                    api={api}
                    databaseRefreshRevision={databaseRefreshRevision}
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

      {page && !trashOpen && (
        <RevisionHistoryDialog
          api={api}
          path={page.path}
          open={revisionHistoryOpen}
          dirty={saveState === "dirty" || saveState === "saving"}
          currentMarkdown={() => serializeMarkdownFile(page.frontmatter, getCurrentDraftBody())}
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
        title: stripMarkdownExtension(node.name),
        kind: node.kind === "workspace"
          ? "workspace"
          : node.kind === "folder"
            ? "folder"
            : node.kind === "database"
              ? "database"
              : "page"
      });
    }
    node.children?.forEach(visit);
  };

  visit(tree);
  return documents.sort((left, right) => left.title.localeCompare(right.title));
}

function parentPathForPage(pagePath: string): string {
  const parts = pagePath.split("/");
  parts.pop();
  return parts.join("/");
}

function pagePathForRenamedNode(
  nodePath: string,
  kind: PageDocument["kind"]
): string {
  if (kind === "page") return nodePath;
  const nodeName = nodePath.split("/").at(-1) ?? nodePath;
  const companionName = kind === "database"
    ? `${nodeName}.db.md`
    : `${nodeName}.index.md`;
  return `${nodePath}/${companionName}`;
}

function stripMarkdownExtension(name: string): string {
  return name.toLocaleLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function mergeReferenceRepairIntoPage(
  page: PageDocument,
  markdownBody: string,
  event: RumiEvent
): PageDocument {
  if (!event.referenceRepair || !event.version) return { ...page, markdownBody };
  const currentMarkdown = serializeMarkdownFile(page.frontmatter, markdownBody);
  const rewritten = rewriteMarkdownReferences(
    currentMarkdown,
    event.referenceRepair.previousPath,
    event.referenceRepair.nextPath,
    page.path
  );
  const parsed = parseMarkdownFile(rewritten.markdown);
  return {
    ...page,
    frontmatter: parsed.frontmatter,
    markdownBody: parsed.body,
    version: event.version,
    contentHash: event.contentHash ?? event.version
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

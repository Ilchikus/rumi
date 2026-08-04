import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactElement } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { SidebarSimple } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { RumiApiClient } from "@rumi/api-client";
import { toast } from "sonner";
import {
  parseMarkdownFile,
  rewriteMarkdownReferences,
  serializeMarkdownFile
} from "@rumi/markdown";
import { cleanWorkspaceName } from "@rumi/workspace-format";
import type {
  InlineToolbarMode,
  DatabasePropertyOptionColor,
  DatabasePropertyType,
  PageDocument,
  RumiEvent,
  SavePageReason,
  SavePageResult,
  SearchWorkspaceResultItem,
  TrashItem,
  TrashPageResult,
  WorkspaceSettings,
  WorkspaceSettingsResult,
  WorkspaceNode
} from "@rumi/contracts";
import type {
  RumiBlockEditorHandle,
  RumiDocumentLink
} from "./components/editor/RumiBlockEditor";
import { DatabaseView } from "./components/database/DatabaseView";
import {
  bumpDatabaseRefreshRevision,
  databaseRefreshRevisionFor
} from "./components/database/databaseRefresh";
import type { DatabaseRefreshRevisions } from "./components/database/databaseRefresh";
import { mergeRefreshedDatabaseContext } from "./components/database/databasePageContext";
import { PageProperties } from "./components/editor/PageProperties";
import { EditablePageTitle } from "./components/editor/EditablePageTitle";
import type { EditableTitleSplitContext } from "./components/editor/EditablePageTitle";
import { randomDatabaseOptionColor } from "./components/editor/DatabaseOptionPill";
import { RevisionHistoryDialog } from "./components/editor/RevisionHistoryDialog";
import { emptyPageTitle, pageTitleFromPath } from "./components/editor/pagePresentation";
import {
  EDITOR_PAGE_CONTAINER_CLASS
} from "./components/layout/EditorPageLayout";
import { WorkspaceHeader } from "./components/layout/WorkspaceHeader";
import { Sidebar } from "./components/sidebar/Sidebar";
import type { SidebarCreateKind, SidebarSelection } from "./components/sidebar/Sidebar";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { SearchDialog } from "./components/search/SearchDialog";
import { WorkspaceSettingsView } from "./components/settings/WorkspaceSettingsView";
import { DeleteTrashItemDialog, TrashView } from "./components/trash/TrashView";
import {
  clearLastOpenedPage,
  findWorkspaceNode,
  readLastOpenedPage,
  writeLastOpenedPage
} from "./lib/lastOpenedPage";
import {
  findWorkspaceNodeForRoute,
  parseWorkspaceRoute,
  reservedSystemRouteForName,
  workspaceUrlForNode
} from "./lib/workspaceRoute";
import { appShortcutAction, appShortcutPlatform, shortcutLabels } from "./lib/appShortcuts";
import { rememberVisitedPath, takePreviousVisitedNode } from "./lib/pageVisitHistory";
import { rebasePageDocument } from "./lib/optimisticPageSync";
import { resolveWorkspaceDocumentLink } from "./lib/workspaceDocumentLink";
import { cn } from "./lib/utils";
import {
  mergeEditorScrollState,
  pageScrollKey,
  readEditorScrollTop,
  rememberSessionScrollTop,
  resolveNavigationScrollTop,
  restoreEditorScroll
} from "./lib/historyScroll";
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_KEY,
  clamp,
  getSavedSidebarCollapsed,
  getSavedSidebarWidth,
  saveSidebarCollapsed,
  sidebarWidthForViewport
} from "./lib/sidebarLayout";
import {
  canHydrateStartupPage,
  clearWorkspaceStartupSnapshot,
  readStartupPageMode,
  readWorkspaceStartupSnapshot,
  snapshotMatchesWorkspace,
  writeStartupPageMode,
  writeWorkspaceStartupSnapshot,
  type StartupPageMode,
  type WorkspaceStartupSnapshot
} from "./lib/workspaceStartup";

const RumiBlockEditor = lazy(async () => {
  const module = await import("./components/editor/RumiBlockEditor");
  return { default: module.RumiBlockEditor };
});

type LoadState = "idle" | "loading" | "error";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
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
  caretOffset?: number;
  selectAll?: boolean;
};

const MOBILE_SIDEBAR_TRANSITION_MS = 200;
const AUTOSAVE_DELAY_MS = 800;
const MAX_SAVE_REBASE_ATTEMPTS = 3;

function showReservedSystemRouteToast(
  parentPath: string,
  name: string,
  kind: Pick<WorkspaceNode, "kind">["kind"]
): void {
  const route = reservedSystemRouteForName(parentPath, name, kind);
  if (!route) return;

  toast.info(
    <span>
      “{route.label}” is reserved for the system page{" "}
      <a className="text-sky-600 underline underline-offset-2" href={route.url}>
        {route.label}
      </a>.
    </span>
  );
}

function waitForEditorFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

export function App(): ReactElement {
  const api = useMemo(() => new RumiApiClient(), []);
  const startupSnapshot = useMemo(
    () => readWorkspaceStartupSnapshot(window.localStorage),
    []
  );
  const initialStartupPageMode = startupSnapshot
    ? readStartupPageMode(window.localStorage, startupSnapshot.workspace.rootPath)
    : "last-visited";
  const startupSnapshotPathname = startupSnapshot
    ? workspaceUrlForNode(
        {
          path: startupSnapshot.selection.nodePath,
          kind: startupSnapshot.selection.kind
        },
        startupSnapshot.tree
      )
    : "";
  const hydrateStartupPage = Boolean(
    startupSnapshot
    && canHydrateStartupPage(
      window.location.pathname,
      initialStartupPageMode,
      startupSnapshotPathname,
      startupSnapshot.selection.kind === "workspace"
        && startupSnapshot.selection.nodePath === ""
        && startupSnapshot.tree.path === ""
        && startupSnapshot.tree.companionPath === startupSnapshot.selection.openPath
    )
  );
  const setMessage = useCallback((message: string) => {
    if (message) toast.error(message);
  }, []);
  const [workspaceName, setWorkspaceName] = useState(startupSnapshot?.workspace.name ?? "Rumi");
  const [workspaceRootPath, setWorkspaceRootPath] = useState(startupSnapshot?.workspace.rootPath ?? "");
  const [tree, setTree] = useState<WorkspaceNode | null>(startupSnapshot?.tree ?? null);
  const [treeRevalidated, setTreeRevalidated] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashLoadState, setTrashLoadState] = useState<LoadState>("idle");
  const [restoringTrashId, setRestoringTrashId] = useState<string | null>(null);
  const [deletingTrashId, setDeletingTrashId] = useState<string | null>(null);
  const [deleteForeverTarget, setDeleteForeverTarget] = useState<TrashItem | null>(null);
  const [activeTrashPage, setActiveTrashPage] = useState<TrashPageResult | null>(null);
  const [selection, setSelection] = useState<SidebarSelection | null>(
    hydrateStartupPage && startupSnapshot ? startupSnapshot.selection : null
  );
  const [page, setPage] = useState<PageDocument | null>(
    hydrateStartupPage && startupSnapshot ? startupSnapshot.page : null
  );
  const [pageTitleOverride, setPageTitleOverride] = useState<{ path: string; title: string } | null>(null);
  const [pageRenamePending, setPageRenamePending] = useState(false);
  const [pageTitleEditRequest, setPageTitleEditRequest] = useState<PageTitleEditRequest | null>(null);
  const [draftBody, setDraftBody] = useState(
    hydrateStartupPage && startupSnapshot ? startupSnapshot.page.markdownBody : ""
  );
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [editorRevision, setEditorRevision] = useState(0);
  const [databaseRefreshRevisions, setDatabaseRefreshRevisions] = useState<DatabaseRefreshRevisions>({});
  const [revisionHistoryOpen, setRevisionHistoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceSettingsResult, setWorkspaceSettingsResult] =
    useState<WorkspaceSettingsResult | null>(null);
  const [settingsLoadState, setSettingsLoadState] = useState<LoadState>("idle");
  const [highlightMisspellings, setHighlightMisspellings] = useState(false);
  const [inlineReplacements, setInlineReplacements] = useState(true);
  const [emojiSuggestions, setEmojiSuggestions] = useState(true);
  const [inlineToolbar, setInlineToolbar] = useState<InlineToolbarMode>("floating");
  const [startupPageMode, setStartupPageMode] = useState<StartupPageMode>(initialStartupPageMode);
  const [allowedUploadFileTypes, setAllowedUploadFileTypes] = useState<string[]>([]);
  const [rootCreateMenuOpen, setRootCreateMenuOpen] = useState(false);
  const [routeSyncReady, setRouteSyncReady] = useState(false);
  const [scrollRestoreRevision, setScrollRestoreRevision] = useState(0);
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
  const dirtyBodyRef = useRef(false);
  const dirtyFrontmatterRef = useRef(false);
  const dirtyDocumentPathRef = useRef<string | null>(null);
  const saveReasonRef = useRef<SavePageReason>("editor-autosave");
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const savePageRef = useRef<(() => Promise<boolean>) | null>(null);
  const pageRenameIntentRef = useRef<PageRenameIntent | null>(null);
  const pageTitleUndoRef = useRef<PageTitleUndoAction | null>(null);
  const pageTitleUndoInFlightRef = useRef(false);
  const pageTitleEditRequestIdRef = useRef(0);
  const deferredReferenceRepairRef = useRef<RumiEvent | null>(null);
  const settingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingHistoryActionRef = useRef<"push" | "replace">("replace");
  const pageLoadCacheRef = useRef<Map<string, Promise<PageDocument>>>(new Map());
  const pageLoadCacheGenerationRef = useRef(0);
  const openRequestIdRef = useRef(0);
  const restoredWorkspaceRef = useRef<string | null>(null);
  const hydratedWorkspaceRootRef = useRef(startupSnapshot?.workspace.rootPath ?? null);
  const startupSnapshotPendingValidationRef = useRef(Boolean(startupSnapshot));
  const startupSnapshotRef = useRef(startupSnapshot);
  const pendingScrollRestoreRef = useRef<number | null>(0);
  const historyEntryRevisionRef = useRef(0);
  const sessionScrollPositionsRef = useRef<Map<string, number>>(new Map());
  const activeScrollKeyRef = useRef<string | null>(null);
  const pageVisitHistoryRef = useRef<string[]>([]);
  const shortcutPlatform = useMemo(() => appShortcutPlatform(), []);
  const shortcutLabel = useMemo(() => shortcutLabels(shortcutPlatform), [shortcutPlatform]);
  const isNarrow = viewportWidth < 768;
  const visibleSidebarWidth = sidebarWidthForViewport(sidebarWidth, viewportWidth);
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
  const renderedScrollKey = settingsOpen
    ? "system:settings"
    : activeTrashPage
      ? `trash:${activeTrashPage.item.id}`
      : trashOpen
        ? "system:trash"
        : page
          ? pageScrollKey(page.path)
          : null;
  const destinationScrollKey = settingsOpen
    ? "system:settings"
    : activeTrashPage
      ? `trash:${activeTrashPage.item.id}`
      : trashOpen
        ? "system:trash"
        : selection?.openPath
          ? pageScrollKey(selection.openPath)
          : null;

  useEffect(() => {
    document.title = activeTrashPage
      ? pageTitleFromPath(activeTrashPage.page.path, activeTrashPage.page.kind)
      : settingsOpen
        ? "Settings"
      : trashOpen
        ? "Trash"
        : pageTitle ?? "Rumi";
  }, [activeTrashPage, pageTitle, settingsOpen, trashOpen]);

  const loadTree = useCallback(async () => {
    setLoadState("loading");
    setMessage("");

    try {
      const [workspace, nextTree] = await Promise.all([api.getWorkspace(), api.getTree()]);
      const hydratedWorkspaceRoot = hydratedWorkspaceRootRef.current;
      const shouldValidateStartupSnapshot = startupSnapshotPendingValidationRef.current;
      if (
        shouldValidateStartupSnapshot
        && hydratedWorkspaceRoot
        && hydratedWorkspaceRoot !== workspace.rootPath
      ) {
        clearWorkspaceStartupSnapshot(window.localStorage);
        startupSnapshotRef.current = null;
        openRequestIdRef.current += 1;
        restoredWorkspaceRef.current = null;
        selectionRef.current = null;
        pageRef.current = null;
        setSelection(null);
        setPage(null);
        setDraftBody("");
      } else if (shouldValidateStartupSnapshot && hydratedWorkspaceRoot === workspace.rootPath) {
        const currentSelection = selectionRef.current;
        const freshSelectionNode = currentSelection
          ? findWorkspaceNode(nextTree, currentSelection.nodePath)
          : null;
        const cachedSelectionIsStale = Boolean(
          currentSelection
          && (
            !freshSelectionNode
            || openPathForNode(freshSelectionNode) !== currentSelection.openPath
          )
        );

        if (cachedSelectionIsStale && !hasUnsavedPageChanges(saveStateRef.current)) {
          clearLastOpenedPage(window.localStorage, workspace.rootPath);
          clearWorkspaceStartupSnapshot(window.localStorage);
          startupSnapshotRef.current = null;
          openRequestIdRef.current += 1;
          restoredWorkspaceRef.current = null;
          selectionRef.current = null;
          pageRef.current = null;
          setSelection(null);
          setPage(null);
          setDraftBody("");
        }
      }
      startupSnapshotPendingValidationRef.current = false;
      hydratedWorkspaceRootRef.current = workspace.rootPath;
      setWorkspaceName(workspace.name);
      setWorkspaceRootPath(workspace.rootPath);
      setTree(nextTree);
      setStartupPageMode(readStartupPageMode(window.localStorage, workspace.rootPath));
      setTreeRevalidated(true);
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

  const loadWorkspaceSettings = useCallback(async () => {
    setSettingsLoadState("loading");
    try {
      const result = await api.getWorkspaceSettings();
      setWorkspaceSettingsResult(result);
      setHighlightMisspellings(result.settings.editor.highlightMisspellings);
      setInlineReplacements(result.settings.editor.inlineReplacements);
      setEmojiSuggestions(result.settings.editor.emojiSuggestions);
      setInlineToolbar(result.settings.editor.inlineToolbar);
      setAllowedUploadFileTypes(result.settings.uploads.allowedFileTypes);
      setSettingsLoadState("idle");
    } catch (error) {
      setSettingsLoadState("error");
      setMessage(errorMessage(error));
    }
  }, [api, setMessage]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    void loadTrash();
  }, [loadTrash]);

  useEffect(() => {
    void loadWorkspaceSettings();
  }, [loadWorkspaceSettings]);

  useEffect(() => {
    pageRef.current = page;
    const nextPath = page?.path ?? null;
    if (dirtyDocumentPathRef.current !== nextPath) {
      dirtyDocumentPathRef.current = nextPath;
      if (saveStateRef.current !== "dirty") {
        dirtyBodyRef.current = false;
        dirtyFrontmatterRef.current = false;
      }
    }
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

  useLayoutEffect(() => {
    activeScrollKeyRef.current = renderedScrollKey;
  }, [renderedScrollKey]);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.history.replaceState(
      mergeEditorScrollState(window.history.state, 0),
      "",
      window.location.href
    );

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    let frame: number | null = null;
    const captureScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("[data-rumi-editor-canvas]")) {
        return;
      }
      const scrollKey = activeScrollKeyRef.current;
      rememberSessionScrollTop(
        sessionScrollPositionsRef.current,
        scrollKey,
        target.scrollTop
      );
      const entryRevision = historyEntryRevisionRef.current;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (entryRevision !== historyEntryRevisionRef.current) return;
        window.history.replaceState(
          mergeEditorScrollState(window.history.state, target.scrollTop),
          "",
          window.location.href
        );
      });
    };

    document.addEventListener("scroll", captureScroll, true);
    return () => {
      document.removeEventListener("scroll", captureScroll, true);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const getCurrentDraftBody = useCallback(() => editorRef.current?.getMarkdown() ?? draftBodyRef.current, []);

  const markPageDirty = useCallback((reason: SavePageReason) => {
    saveReasonRef.current = reason;
    if (reason === "editor-autosave") dirtyBodyRef.current = true;
    if (reason === "property-edit") dirtyFrontmatterRef.current = true;
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

  const refreshOpenPageDatabaseContext = useCallback(async (
    expectedPagePath?: string
  ): Promise<boolean> => {
    const currentPage = pageRef.current;

    if (
      !currentPage?.database
      || (expectedPagePath !== undefined && currentPage.path !== expectedPagePath)
    ) {
      return false;
    }

    try {
      forgetCachedPage(currentPage.path);
      const refreshedPage = await api.openPage(currentPage.path);
      const latestPage = pageRef.current;

      // Refresh only the database-owned context. The open record may still have
      // unsaved frontmatter or Markdown that must remain authoritative locally.
      const nextPage = latestPage
        ? mergeRefreshedDatabaseContext(latestPage, refreshedPage)
        : null;
      if (!nextPage) return false;
      pageRef.current = nextPage;
      setPage(nextPage);
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      return false;
    }
  }, [api, forgetCachedPage]);

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

      try {
        const result = await api.createDatabaseProperty({
          databasePath: database.databasePath,
          baseVersion: database.schemaVersion,
          property,
          type
        });

        if (result.status === "conflict") {
          forgetCachedPage(currentPage.path);
          await refreshOpenPageDatabaseContext(currentPage.path);
          return false;
        }

        const refreshed = await refreshOpenPageDatabaseContext(currentPage.path);
        if (refreshed) setMessage("");
        return refreshed;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, forgetCachedPage, refreshOpenPageDatabaseContext]
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
          await refreshOpenPageDatabaseContext(currentPage.path);
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
          await refreshOpenPageDatabaseContext(currentPage.path);
          return false;
        }

        const refreshed = await refreshOpenPageDatabaseContext(currentPage.path);
        if (refreshed) setMessage("");
        return refreshed;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, forgetCachedPage, refreshOpenPageDatabaseContext]
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
          await refreshOpenPageDatabaseContext(currentPage.path);
          return false;
        }

        const refreshed = await refreshOpenPageDatabaseContext(currentPage.path);
        if (refreshed) setMessage("");
        return refreshed;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, forgetCachedPage, refreshOpenPageDatabaseContext]
  );

  const setOpenPageDatabasePropertyVisibility = useCallback(
    async (property: string, visible: boolean): Promise<boolean> => {
      const currentPage = pageRef.current;
      const database = currentPage?.database;
      if (!currentPage || !database || !database.schema.properties[property]) return false;

      try {
        const result = await api.setDatabaseRecordPagePropertyVisibility({
          databasePath: database.databasePath,
          baseVersion: database.schemaVersion,
          property,
          visible
        });
        if (result.status === "conflict") {
          forgetCachedPage(currentPage.path);
          await refreshOpenPageDatabaseContext(currentPage.path);
          return false;
        }

        const refreshed = await refreshOpenPageDatabaseContext(currentPage.path);
        if (refreshed) setMessage("");
        return refreshed;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    },
    [api, forgetCachedPage, refreshOpenPageDatabaseContext]
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
    const handleAppShortcut = (event: globalThis.KeyboardEvent) => {
      const action = appShortcutAction(event, shortcutPlatform);
      if (!action) return;

      if (action === "open-create-menu" && !tree) return;

      event.preventDefault();
      event.stopPropagation();

      if (action === "open-create-menu") {
        setRootCreateMenuOpen(true);
        if (sidebarCollapsed) {
          setSidebarCollapsedState(false, setSidebarCollapsed);
        }
        return;
      }

      const nextCollapsed = !sidebarCollapsed;
      if (nextCollapsed) setRootCreateMenuOpen(false);
      setSidebarCollapsedState(nextCollapsed, setSidebarCollapsed);
    };

    window.addEventListener("keydown", handleAppShortcut, true);
    return () => window.removeEventListener("keydown", handleAppShortcut, true);
  }, [shortcutPlatform, sidebarCollapsed, tree]);

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
    async (
      node: WorkspaceNode,
      historyAction: "push" | "replace" = "push",
      historyEntryScrollTop?: number
    ) => {
      const requestId = ++openRequestIdRef.current;
      const openPath = openPathForNode(node);
      if (historyAction === "push") {
        pageVisitHistoryRef.current = rememberVisitedPath(
          pageVisitHistoryRef.current,
          selectionRef.current?.nodePath ?? null,
          node.path
        );
      }
      const nextSelection = { nodePath: node.path, openPath, kind: node.kind };
      pendingHistoryActionRef.current = historyAction;
      pendingScrollRestoreRef.current = resolveNavigationScrollTop(
        sessionScrollPositionsRef.current,
        openPath ? pageScrollKey(openPath) : null,
        historyEntryScrollTop
      );
      selectionRef.current = nextSelection;
      setSelection(nextSelection);
      saveStateRef.current = "idle";
      setSaveState("idle");
      setMessage("");
      setSettingsOpen(false);
      setTrashOpen(false);
      setActiveTrashPage(null);

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

        if (
          dirtyDocumentPathRef.current === openPath
          && hasUnsavedPageChanges(saveStateRef.current)
        ) {
          setLoadState("idle");
          return;
        }

        pageRef.current = nextPage;
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

  const redirectAfterDeletedNode = useCallback(async (deletedPath: string): Promise<void> => {
    if (trashOpen) return;
    const currentSelection = selectionRef.current;
    if (!currentSelection || !isSameOrDescendant(currentSelection.nodePath, deletedPath)) return;

    const previous = tree
      ? takePreviousVisitedNode(pageVisitHistoryRef.current, tree, deletedPath)
      : { history: [], node: null };
    pageVisitHistoryRef.current = previous.history;
    dirtyBodyRef.current = false;
    dirtyFrontmatterRef.current = false;
    saveStateRef.current = "idle";
    setSaveState("idle");

    if (previous.node) {
      await openNode(previous.node, "replace");
      return;
    }

    if (tree) {
      await openNode(tree, "replace");
      return;
    }

    pendingHistoryActionRef.current = "replace";
    selectionRef.current = null;
    setPage(null);
    setDraftBody("");
    setSelection(null);
    setSettingsOpen(false);
    setTrashOpen(false);
    setActiveTrashPage(null);
    clearLastOpenedPage(window.localStorage, workspaceRootPath);
    clearWorkspaceStartupSnapshot(window.localStorage);
    startupSnapshotRef.current = null;
  }, [openNode, trashOpen, tree, workspaceRootPath]);

  const openDocumentLink = useCallback((
    path: string,
    target: "current" | "new" = "current"
  ) => {
    const linkedNode = resolveWorkspaceDocumentLink(tree, path, pageRef.current?.path);
    if (!linkedNode) {
      return;
    }
    if (target === "new") {
      window.open(
        workspaceUrlForNode(linkedNode, tree),
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }
    void openNode(linkedNode);
  }, [openNode, tree]);

  const uploadEditorAsset = useCallback(async (file: File): Promise<string> => {
    const result = await api.uploadAsset(file.name, file);
    setMessage("");
    return result.path;
  }, [api]);

  const openTrashPage = useCallback(async (
    itemOrId: TrashItem | string,
    historyAction: "push" | "replace" = "push",
    originalPagePath?: string
  ): Promise<void> => {
    const id = typeof itemOrId === "string" ? itemOrId : itemOrId.id;
    pendingHistoryActionRef.current = historyAction;
    setLoadState("loading");
    try {
      const result = await api.openTrashPage(id, originalPagePath);
      openRequestIdRef.current += 1;
      setPage(null);
      setDraftBody("");
      setSelection(null);
      setSaveState("idle");
      setSettingsOpen(false);
      setTrashOpen(true);
      setActiveTrashPage(result);
      setLoadState("idle");
      if (isNarrow) setSidebarCollapsedState(true, setSidebarCollapsed);
    } catch (error) {
      setLoadState("error");
      setMessage(errorMessage(error));
    }
  }, [api, isNarrow, setMessage]);

  useEffect(() => {
    if (!tree || !workspaceRootPath || restoredWorkspaceRef.current === workspaceRootPath) {
      return;
    }

    const route = parseWorkspaceRoute(window.location.pathname);

    if (route?.view === "node" && !findWorkspaceNodeForRoute(tree, route) && !treeRevalidated) {
      return;
    }

    restoredWorkspaceRef.current = workspaceRootPath;

    if (route?.view === "settings") {
      pendingHistoryActionRef.current = "replace";
      setSettingsOpen(true);
      setTrashOpen(false);
      setActiveTrashPage(null);
      setRouteSyncReady(true);
      void loadWorkspaceSettings();
      return;
    }

    if (route?.view === "trash") {
      pendingHistoryActionRef.current = "replace";
      setSettingsOpen(false);
      setTrashOpen(true);
      setActiveTrashPage(null);
      setRouteSyncReady(true);
      void loadTrash();
      return;
    }

    if (route?.view === "trash-item") {
      setRouteSyncReady(true);
      const originalPagePath = new URLSearchParams(window.location.search).get("path") ?? undefined;
      void openTrashPage(route.id, "replace", originalPagePath);
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
      window.history.replaceState(mergeEditorScrollState(window.history.state, 0), "", "/");
      setRouteSyncReady(true);
      return;
    }

    if (route?.view === "home") {
      const cachedSelection = startupSnapshot
        && snapshotMatchesWorkspace(startupSnapshot, workspaceRootPath)
        ? startupSnapshot.selection
        : null;
      const savedPage = startupPageMode === "last-visited"
        ? readLastOpenedPage(window.localStorage, workspaceRootPath) ?? cachedSelection
        : null;
      const savedNode = savedPage ? findWorkspaceNode(tree, savedPage.nodePath) : null;

      if (savedPage && savedNode && openPathForNode(savedNode) === savedPage.openPath) {
        setRouteSyncReady(true);
        void openNode(savedNode, "replace");
        return;
      }

      if (savedPage) clearLastOpenedPage(window.localStorage, workspaceRootPath);
      setRouteSyncReady(true);
      void openNode(tree, "replace");
      return;
    }

    if (!route) {
      pendingHistoryActionRef.current = "replace";
      window.history.replaceState(mergeEditorScrollState(window.history.state, 0), "", "/");
      setRouteSyncReady(true);
      return;
    }
  }, [
    loadTrash,
    loadWorkspaceSettings,
    openNode,
    openTrashPage,
    startupPageMode,
    startupSnapshot,
    tree,
    treeRevalidated,
    workspaceRootPath
  ]);

  useEffect(() => {
    if (!routeSyncReady || !tree) return;

    const handlePopState = (event: PopStateEvent) => {
      historyEntryRevisionRef.current += 1;
      setScrollRestoreRevision((revision) => revision + 1);
      const route = parseWorkspaceRoute(window.location.pathname);
      const historyScrollTop = readEditorScrollTop(event.state);
      pendingHistoryActionRef.current = "replace";
      pendingScrollRestoreRef.current = historyScrollTop;

      if (route?.view === "settings") {
        setSettingsOpen(true);
        setTrashOpen(false);
        setActiveTrashPage(null);
        setMessage("");
        void loadWorkspaceSettings();
        return;
      }

      if (route?.view === "trash") {
        setSettingsOpen(false);
        setTrashOpen(true);
        setActiveTrashPage(null);
        setMessage("");
        void loadTrash();
        return;
      }

      if (route?.view === "trash-item") {
        const originalPagePath = new URLSearchParams(window.location.search).get("path") ?? undefined;
        void openTrashPage(route.id, "replace", originalPagePath);
        return;
      }

      if (route?.view === "node") {
        const routedNode = findWorkspaceNodeForRoute(tree, route);
        if (routedNode) {
          void openNode(routedNode, "replace", historyScrollTop);
          return;
        }
      }

      if (route?.view === "home") {
        void openNode(tree, "replace", historyScrollTop);
        return;
      }

      openRequestIdRef.current += 1;
      setSettingsOpen(false);
      setTrashOpen(false);
      setActiveTrashPage(null);
      setPage(null);
      setDraftBody("");
      setSelection(null);
      setSaveState("idle");
      window.history.replaceState(mergeEditorScrollState(window.history.state, 0), "", "/");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    loadTrash,
    loadWorkspaceSettings,
    openNode,
    openTrashPage,
    routeSyncReady,
    tree
  ]);

  useEffect(() => {
    if (!routeSyncReady) return;
    const nextUrl = settingsOpen
      ? "/settings"
      : activeTrashPage
      ? `/trash/${activeTrashPage.item.id}?${new URLSearchParams({
          path: activeTrashPage.page.path
        }).toString()}`
      : trashOpen
      ? "/trash"
      : selection
        ? workspaceUrlForNode({ path: selection.nodePath, kind: selection.kind }, tree)
        : "/";

    if (`${window.location.pathname}${window.location.search}` === nextUrl) {
      pendingHistoryActionRef.current = "replace";
      return;
    }

    const action = pendingHistoryActionRef.current;
    historyEntryRevisionRef.current += 1;
    const canvas = document.querySelector<HTMLElement>("[data-rumi-editor-canvas]");
    const replacementScrollTop = pendingScrollRestoreRef.current
      ?? (action === "replace"
        ? canvas?.scrollTop
        : resolveNavigationScrollTop(
            sessionScrollPositionsRef.current,
            destinationScrollKey
          ))
      ?? 0;
    if (action === "push") {
      window.history.replaceState(
        mergeEditorScrollState(window.history.state, canvas?.scrollTop ?? 0),
        "",
        window.location.href
      );
    }
    window.history[action === "push" ? "pushState" : "replaceState"](
      mergeEditorScrollState(
        action === "push" ? null : window.history.state,
        replacementScrollTop
      ),
      "",
      nextUrl
    );
    pendingScrollRestoreRef.current = replacementScrollTop;
    setScrollRestoreRevision((revision) => revision + 1);
    pendingHistoryActionRef.current = "replace";
  }, [
    activeTrashPage,
    destinationScrollKey,
    routeSyncReady,
    selection,
    settingsOpen,
    trashOpen,
    tree
  ]);

  useEffect(() => {
    const scrollTop = pendingScrollRestoreRef.current;
    if (scrollTop === null) return;
    if (selection?.openPath && page?.path !== selection.openPath) return;

    pendingScrollRestoreRef.current = null;
    return restoreEditorScroll(
      () => document.querySelector<HTMLElement>("[data-rumi-editor-canvas]"),
      scrollTop
    );
  }, [
    activeTrashPage?.item.id,
    page?.path,
    scrollRestoreRevision,
    selection?.openPath,
    settingsOpen,
    trashOpen
  ]);

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

  useEffect(() => {
    if (!workspaceRootPath || !tree) return;

    const persistSnapshot = (
      snapshotSelection: SidebarSelection,
      snapshotPage: PageDocument
    ): void => {
      if (!snapshotSelection.openPath || snapshotSelection.openPath !== snapshotPage.path) return;
      const nextSnapshot: WorkspaceStartupSnapshot = {
        schemaVersion: 1,
        cachedAt: Date.now(),
        workspace: { rootPath: workspaceRootPath, name: workspaceName },
        tree,
        selection: {
          nodePath: snapshotSelection.nodePath,
          openPath: snapshotSelection.openPath,
          kind: snapshotSelection.kind
        },
        page: snapshotPage
      };
      startupSnapshotRef.current = writeWorkspaceStartupSnapshot(
        window.localStorage,
        nextSnapshot
      )
        ? nextSnapshot
        : null;
    };

    const currentPageIsStable = Boolean(
      page
      && selection?.openPath
      && selection.openPath === page.path
      && (saveState === "idle" || saveState === "saved")
    );

    if (startupPageMode === "last-visited") {
      if (currentPageIsStable && page && selection) persistSnapshot(selection, page);
      return;
    }

    const homeOpenPath = openPathForNode(tree);
    if (!homeOpenPath) return;
    const homeSelection: SidebarSelection = {
      nodePath: tree.path,
      openPath: homeOpenPath,
      kind: "workspace"
    };

    if (page?.path === homeOpenPath && selection?.nodePath === tree.path) {
      if (currentPageIsStable) persistSnapshot(homeSelection, page);
      return;
    }

    const cachedSnapshot = startupSnapshotRef.current;
    if (
      cachedSnapshot
      && snapshotMatchesWorkspace(cachedSnapshot, workspaceRootPath)
      && cachedSnapshot.selection.kind === "workspace"
      && cachedSnapshot.selection.nodePath === tree.path
      && cachedSnapshot.selection.openPath === homeOpenPath
      && cachedSnapshot.page.path === homeOpenPath
    ) {
      persistSnapshot(homeSelection, cachedSnapshot.page);
      return;
    }

    let active = true;
    void loadPage(homeOpenPath).then(
      (homePage) => {
        if (active) persistSnapshot(homeSelection, homePage);
      },
      () => undefined
    );
    return () => {
      active = false;
    };
  }, [
    loadPage,
    page,
    saveState,
    selection,
    startupPageMode,
    tree,
    workspaceName,
    workspaceRootPath
  ]);

  const requestPageTitleSelection = useCallback((path: string) => {
    pageTitleEditRequestIdRef.current += 1;
    setPageTitleEditRequest({
      id: pageTitleEditRequestIdRef.current,
      path,
      selectAll: true
    });
  }, []);

  const refreshAfterMutation = useCallback(
    async (openPath?: string | null): Promise<PageDocument | null> => {
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
        return nextPage;
      }

      return null;
    },
    [loadPage, loadTree]
  );

  const createPage = useCallback(async (
    parentPath: string,
    name: string,
    selectTitleAfterCreate = false
  ) => {
    try {
      const result = await api.createPage({
        parentPath,
        name,
        markdownBody: ""
      });
      showReservedSystemRouteToast(parentPath, name, "page");
      clearPageLoadCache();
      const nextPage = await refreshAfterMutation(result.path);
      if (selectTitleAfterCreate && nextPage) {
        requestPageTitleSelection(nextPage.path);
      }
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      throw error;
    }
  }, [api, clearPageLoadCache, refreshAfterMutation, requestPageTitleSelection]);

  const createFolder = useCallback(async (
    parentPath: string,
    name: string,
    selectTitleAfterCreate = false
  ) => {
    try {
      const result = await api.createFolder({ parentPath, name, markdownBody: "" });
      showReservedSystemRouteToast(parentPath, name, "folder");
      clearPageLoadCache();
      const nextPage = await refreshAfterMutation(result.path);
      if (selectTitleAfterCreate && nextPage) {
        requestPageTitleSelection(nextPage.path);
      }
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      throw error;
    }
  }, [api, clearPageLoadCache, refreshAfterMutation, requestPageTitleSelection]);

  const createDatabase = useCallback(async (
    parentPath: string,
    name: string,
    selectTitleAfterCreate = false
  ) => {
    try {
      const result = await api.createDatabase({ parentPath, name });
      showReservedSystemRouteToast(parentPath, name, "database");
      clearPageLoadCache();
      await loadTree();
      const nextPage = await loadPage(result.path);
      pendingHistoryActionRef.current = "push";
      setPage(nextPage);
      setDraftBody(nextPage.markdownBody);
      setSelection({ nodePath: result.path, openPath: nextPage.path, kind: "database" });
      if (selectTitleAfterCreate) {
        requestPageTitleSelection(nextPage.path);
      }
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
      throw error;
    }
  }, [api, clearPageLoadCache, loadPage, loadTree, requestPageTitleSelection]);

  const createDefaultItem = useCallback(async (
    parentPath: string,
    kind: SidebarCreateKind
  ) => {
    const defaultName = emptyPageTitle(kind);

    if (kind === "page") {
      await createPage(parentPath, defaultName, true);
    } else if (kind === "folder") {
      await createFolder(parentPath, defaultName, true);
    } else {
      await createDatabase(parentPath, defaultName, true);
    }
  }, [createDatabase, createFolder, createPage]);

  const openRecordPath = useCallback(async (recordPath: string) => {
    try {
      setSettingsOpen(false);
      setTrashOpen(false);
      setActiveTrashPage(null);
      const nextPage = await loadPage(recordPath);
      pendingHistoryActionRef.current = "push";
      setPage(nextPage);
      setDraftBody(nextPage.markdownBody);
      setSelection({ nodePath: recordPath, openPath: nextPage.path, kind: "page" });
      saveStateRef.current = "idle";
      setSaveState("idle");
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
    }
  }, [loadPage]);

  const openSearchResult = useCallback(async (item: SearchWorkspaceResultItem) => {
    try {
      setSettingsOpen(false);
      setTrashOpen(false);
      setActiveTrashPage(null);
      const nextPage = await loadPage(item.path);
      pendingHistoryActionRef.current = "push";
      setPage(nextPage);
      setDraftBody(nextPage.markdownBody);
      setSelection({
        nodePath: item.kind === "page" ? item.path : parentPathForPage(item.path),
        openPath: nextPage.path,
        kind: item.kind
      });
      saveStateRef.current = "idle";
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
        showReservedSystemRouteToast(
          parentPathForPage(node.path),
          nextName,
          node.kind
        );
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
        const currentSelection = selectionRef.current;
        const deletingOpenPage = Boolean(
          currentSelection && isSameOrDescendant(currentSelection.nodePath, node.path)
        );

        if (deletingOpenPage) {
          const pendingSave = saveInFlightRef.current ??
            (saveStateRef.current === "dirty" || saveStateRef.current === "error"
              ? savePageRef.current?.()
              : null);
          if (pendingSave && !(await pendingSave)) return false;
        }

        await api.deleteNode({ path: node.path, recursive: isFolder });
        clearPageLoadCache();
        await Promise.all([loadTree(), loadTrash()]);

        if (deletingOpenPage) {
          await redirectAfterDeletedNode(node.path);
        }

        setMessage("");
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        setSaveState("error");
        return false;
      }
    },
    [api, clearPageLoadCache, loadTrash, loadTree, redirectAfterDeletedNode, setMessage]
  );

  const openTrash = useCallback(() => {
    pendingHistoryActionRef.current = "push";
    setSettingsOpen(false);
    setTrashOpen(true);
    setActiveTrashPage(null);
    setMessage("");
    void loadTrash();
    if (isNarrow) setSidebarCollapsedState(true, setSidebarCollapsed);
  }, [isNarrow, loadTrash]);

  const openSettings = useCallback(() => {
    pendingHistoryActionRef.current = "push";
    setSettingsOpen(true);
    setTrashOpen(false);
    setActiveTrashPage(null);
    setMessage("");
    void loadWorkspaceSettings();
    if (isNarrow) setSidebarCollapsedState(true, setSidebarCollapsed);
  }, [isNarrow, loadWorkspaceSettings]);

  const saveWorkspaceSettings = useCallback((
    settings: WorkspaceSettings,
    nextStartupPageMode: StartupPageMode
  ): Promise<boolean> => {
    const queuedSave = settingsSaveQueueRef.current.then(async (): Promise<boolean> => {
      try {
        const result = await api.updateWorkspaceSettings(settings);
        setHighlightMisspellings(result.settings.editor.highlightMisspellings);
        setInlineReplacements(result.settings.editor.inlineReplacements);
        setEmojiSuggestions(result.settings.editor.emojiSuggestions);
        setInlineToolbar(result.settings.editor.inlineToolbar);
        setAllowedUploadFileTypes(result.settings.uploads.allowedFileTypes);
        writeStartupPageMode(window.localStorage, workspaceRootPath, nextStartupPageMode);
        setStartupPageMode(nextStartupPageMode);
        setSettingsLoadState("idle");
        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        return false;
      }
    });
    settingsSaveQueueRef.current = queuedSave.then(() => undefined);
    return queuedSave;
  }, [api, setMessage, workspaceRootPath]);

  const restoreTrashItem = useCallback(async (
    item: TrashItem,
    openAfterRestore = false
  ): Promise<void> => {
    if (restoringTrashId) return;
    setRestoringTrashId(item.id);
    try {
      const result = await api.restoreTrashItem({ id: item.id });
      clearPageLoadCache();
      await Promise.all([loadTree(), loadTrash()]);
      if (openAfterRestore) {
        const restoringActivePage = activeTrashPage?.item.id === item.id;
        const restoringTrashRootPage = restoringActivePage && (
          item.kind === "page" ||
          (
            activeTrashPage.page.kind === item.kind &&
            parentPathForPage(activeTrashPage.page.path) === item.originalPath
          )
        );
        const restoredOpenPath = restoringActivePage && !restoringTrashRootPage
          ? replacePathPrefix(activeTrashPage.page.path, item.originalPath, result.path)
          : result.path;
        const nextPage = await loadPage(restoredOpenPath);
        pendingHistoryActionRef.current = "replace";
        pageRef.current = nextPage;
        setPage(nextPage);
        setDraftBody(nextPage.markdownBody);
        setSelection({
          nodePath: nextPage.kind === "page"
            ? nextPage.path
            : parentPathForPage(nextPage.path),
          openPath: nextPage.path,
          kind: pageKindToNodeKind(nextPage.kind)
        });
        setSettingsOpen(false);
        setTrashOpen(false);
        setActiveTrashPage(null);
        saveStateRef.current = "idle";
        setSaveState("idle");
      }
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
      setSaveState("error");
    } finally {
      setRestoringTrashId(null);
    }
  }, [activeTrashPage, api, clearPageLoadCache, loadPage, loadTrash, loadTree, restoringTrashId, setMessage]);

  const deleteTrashItemForever = useCallback(async (): Promise<void> => {
    if (!deleteForeverTarget || deletingTrashId) return;
    const item = deleteForeverTarget;
    setDeletingTrashId(item.id);

    try {
      await api.deleteTrashItem(item.id);
      await loadTrash();
      pendingHistoryActionRef.current = "replace";
      setActiveTrashPage((current) => current?.item.id === item.id ? null : current);
      setSettingsOpen(false);
      setTrashOpen(true);
      setDeleteForeverTarget(null);
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setDeletingTrashId(null);
    }
  }, [api, deleteForeverTarget, deletingTrashId, loadTrash, setMessage]);

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
        let saveBase = savingPage;
        let saveBody = markdownBody;
        let saveFrontmatter = frontmatter;
        let result: SavePageResult | null = null;

        for (let attempt = 0; attempt < MAX_SAVE_REBASE_ATTEMPTS; attempt += 1) {
          result = await api.savePage({
            path: savingPage.path,
            baseVersion: saveBase.version,
            frontmatter: saveFrontmatter,
            markdownBody: saveBody,
            reason: saveReason
          });

          if (result.status === "saved") break;

          forgetCachedPage(savingPage.path);
          const latest = await api.openPage(savingPage.path);
          saveBase = rebasePageDocument(latest, savingPage, markdownBody, {
            body: dirtyBodyRef.current,
            frontmatter: dirtyFrontmatterRef.current
          });
          saveBody = saveBase.markdownBody;
          saveFrontmatter = saveBase.frontmatter;

          if (pageRef.current?.path === savingPage.path) {
            if (editorRevisionRef.current === savingRevision) {
              pageRef.current = saveBase;
              setPage(saveBase);
              setDraftBody(saveBody);
            } else {
              const currentPage = pageRef.current;
              const rebasedCurrentPage = {
                ...currentPage,
                frontmatter: dirtyFrontmatterRef.current
                  ? currentPage.frontmatter
                  : latest.frontmatter,
                version: latest.version,
                contentHash: latest.contentHash,
                ...(latest.database ? { database: latest.database } : {})
              };
              pageRef.current = rebasedCurrentPage;
              setPage(rebasedCurrentPage);
            }
          }
        }

        if (pageRef.current?.path !== savingPage.path) return false;

        if (!result || result.status !== "saved") {
          throw new Error("Rumi could not save this page after refreshing its latest version.");
        }

        const savedPage = {
          ...saveBase,
          frontmatter: saveFrontmatter,
          markdownBody: saveBody,
          version: result.version,
          contentHash: result.contentHash
        };

        cacheResolvedPage(savedPage);

        if (editorRevisionRef.current === savingRevision) {
          pageRef.current = savedPage;
          setPage(savedPage);
          editorRef.current?.markClean(saveBody);
          setDraftBody(saveBody);
          dirtyBodyRef.current = false;
          dirtyFrontmatterRef.current = false;
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
  }, [api, cacheResolvedPage, forgetCachedPage, getCurrentDraftBody, setMessage]);

  savePageRef.current = savePage;

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
      showReservedSystemRouteToast(parentPath, finalNodeName, currentPage.kind);
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
      } else if (pageRef.current?.path === intent.previousPagePath) {
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
      if (event.affects?.includes("tree")) {
        void loadTree();
      }

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
      }

      if (
        saveStateRef.current === "saving" &&
        event.sourceClientId === api.clientId
      ) {
        return;
      }

      try {
        const nextPage = await api.openPage(event.path);
        const latestCurrentPage = pageRef.current;
        if (!latestCurrentPage || latestCurrentPage.path !== event.path) return;

        const currentDraftBody = getCurrentDraftBody();
        const keepLocalBody = dirtyBodyRef.current;
        const keepLocalFrontmatter = dirtyFrontmatterRef.current;
        const rebasedPage = rebasePageDocument(
          nextPage,
          latestCurrentPage,
          currentDraftBody,
          { body: keepLocalBody, frontmatter: keepLocalFrontmatter }
        );

        pageRef.current = rebasedPage;
        setPage(rebasedPage);
        setDraftBody(rebasedPage.markdownBody);
        const remainsDirty = keepLocalBody || keepLocalFrontmatter;
        saveStateRef.current = remainsDirty ? "dirty" : "idle";
        setSaveState(remainsDirty ? "dirty" : "idle");
        setMessage("");
      } catch (error) {
        setSaveState("error");
        setMessage(errorMessage(error));
      }
    },
    [api, forgetCachedPage, getCurrentDraftBody, loadTree, setMessage]
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
        const nextSelection = { ...currentSelection, nodePath: nextNodePath, openPath: nextOpenTarget };
        setSelection(nextSelection);
        selectionRef.current = nextSelection;
        const currentPage = pageRef.current;
        const movedPage = currentPage
          ? { ...currentPage, path: nextOpenTarget, markdownBody: currentDraftBody }
          : null;
        pageRef.current = movedPage;
        setPage(movedPage);
        setDraftBody(currentDraftBody);
        saveStateRef.current = "dirty";
        setSaveState("dirty");
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

      await redirectAfterDeletedNode(event.path);
    },
    [clearPageLoadCache, loadTrash, loadTree, redirectAfterDeletedNode]
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

      if (event.name === "trash.changed") {
        void loadTrash();
        if (event.changedBy === "trash.deleteForever" && event.trashItemId) {
          setActiveTrashPage((current) => {
            if (current?.item.id !== event.trashItemId) return current;
            pendingHistoryActionRef.current = "replace";
            setTrashOpen(true);
            return null;
          });
        }
      }

      if (event.name === "folder.childrenChanged" || event.name === "workspace.treeChanged") {
        clearPageLoadCache();
        void loadTree();
        if (event.name === "workspace.treeChanged") void loadTrash();
      }

      if (event.name === "database.recordsChanged" || event.name === "database.schemaChanged") {
        setDatabaseRefreshRevisions((current) =>
          bumpDatabaseRefreshRevision(current, event.path)
        );
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
            workspaceKey={workspaceRootPath}
            tree={tree}
            selection={trashOpen || settingsOpen ? null : selection}
            trashCount={trashItems.length}
            trashOpen={trashOpen}
            settingsOpen={settingsOpen}
            collapsed={sidebarCollapsed}
            rootCreateMenuOpen={rootCreateMenuOpen}
            onToggleCollapsed={() => {
              const nextCollapsed = !sidebarCollapsed;
              if (nextCollapsed) setRootCreateMenuOpen(false);
              setSidebarCollapsedState(nextCollapsed, setSidebarCollapsed);
            }}
            onRootCreateMenuOpenChange={setRootCreateMenuOpen}
            onPrefetchNode={prefetchNode}
            onOpenNode={(node) => void openNode(node)}
            onCreatePage={createPage}
            onCreateFolder={createFolder}
            onCreateDatabase={createDatabase}
            onCreateDefault={createDefaultItem}
            onRenameNode={renameNode}
            onMoveNode={moveNode}
            onConvertNode={convertNode}
            onDeleteNode={deleteNode}
            onOpenSettings={openSettings}
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
          title={`Open sidebar (${shortcutLabel.sidebar})`}
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
          title={`Open sidebar (${shortcutLabel.sidebar})`}
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
          systemView={settingsOpen ? "settings" : trashOpen ? "trash" : null}
          hasOpenPage={Boolean(page && !trashOpen && !settingsOpen)}
          onNavigate={(node) => void openNode(node)}
          onToggleSearch={() => setSearchOpen((open) => !open)}
          onMoveNode={moveNode}
          onMoveToTrash={deleteNode}
          onSeeRevisions={() => setRevisionHistoryOpen(true)}
        />

        {settingsOpen ? (
          <WorkspaceSettingsView
            result={workspaceSettingsResult}
            startupPageMode={startupPageMode}
            loadState={settingsLoadState}
            onReload={() => void loadWorkspaceSettings()}
            onSave={saveWorkspaceSettings}
          />
        ) : trashOpen && !activeTrashPage ? (
          <TrashView
            items={trashItems}
            loadState={trashLoadState}
            restoringId={restoringTrashId}
            deletingId={deletingTrashId}
            onOpen={(item) => void openTrashPage(item)}
            onRestore={restoreTrashItem}
            onDeleteForever={setDeleteForeverTarget}
          />
        ) : activeTrashPage ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-col items-start justify-between gap-3 border-b border-border bg-muted/70 px-6 py-3 text-sm sm:flex-row sm:items-center">
              <p className="text-muted-foreground">
                This page is in Trash. Restore it to continue editing.
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={restoringTrashId !== null || deletingTrashId !== null}
                  onClick={() => void restoreTrashItem(activeTrashPage.item, true)}
                >
                  <ArrowCounterClockwise size={15} />
                  {restoringTrashId === activeTrashPage.item.id ? "Restoring" : "Restore"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                  disabled={restoringTrashId !== null || deletingTrashId !== null}
                  onClick={() => setDeleteForeverTarget(activeTrashPage.item)}
                >
                  <Trash size={15} />
                  {deletingTrashId === activeTrashPage.item.id ? "Deleting" : "Delete"}
                </Button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto" data-rumi-editor-canvas="">
              <article className={`${EDITOR_PAGE_CONTAINER_CLASS} text-muted-foreground opacity-65`}>
                <div className="contents" data-rumi-area-selection-exclude="">
                  <EditablePageTitle
                    title={pageTitleFromPath(activeTrashPage.page.path, activeTrashPage.page.kind)}
                    editable={false}
                    renaming={false}
                    emptyTitle={emptyPageTitle(activeTrashPage.page.kind)}
                    onRename={async () => false}
                    onSplit={async () => false}
                  />
                  <PageProperties
                    frontmatter={activeTrashPage.page.frontmatter}
                    disabled
                  />
                </div>
                <div className={Object.keys(activeTrashPage.page.frontmatter).length > 0 ? "mt-10" : "mt-8"}>
                  <Suspense fallback={null}>
                    <div className="pointer-events-none">
                      <RumiBlockEditor
                        api={api}
                        workspaceKey={workspaceRootPath}
                        documentKey={`trash:${activeTrashPage.item.id}`}
                        markdown={activeTrashPage.page.markdownBody}
                        documents={editorDocuments}
                        onMessage={setMessage}
                        highlightMisspellings={highlightMisspellings}
                        inlineReplacements={inlineReplacements}
                        emojiSuggestions={emojiSuggestions}
                        inlineToolbar={inlineToolbar}
                        allowedUploadFileTypes={allowedUploadFileTypes}
                        readOnly
                        onDirty={() => undefined}
                      />
                    </div>
                  </Suspense>
                </div>
              </article>
            </div>
          </div>
        ) : page ? (
          <div className="relative min-h-0 flex-1 overflow-y-auto" data-rumi-editor-canvas="">
            <article className={EDITOR_PAGE_CONTAINER_CLASS}>
              <div className="contents" data-rumi-area-selection-exclude="">
                <EditablePageTitle
                  title={pageTitle ?? ""}
                  editable={Boolean(
                    selection &&
                    selection.kind !== "workspace" &&
                    selection.openPath === page.path
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
                    variant="original"
                    api={api}
                    databasePath={parentPathForPage(page.path)}
                    preferenceScope={workspaceRootPath}
                    refreshRevision={databaseRefreshRevisionFor(
                      databaseRefreshRevisions,
                      parentPathForPage(page.path)
                    )}
                    onOpenRecord={(recordPath) => void openRecordPath(recordPath)}
                    onMessage={setMessage}
                  />
                ) : (
                  <PageProperties
                    frontmatter={page.frontmatter}
                    database={page.database}
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
                    onSetDatabasePropertyVisibility={setOpenPageDatabasePropertyVisibility}
                  />
                )}
              </div>

              <div className={page.kind === "database" || Object.keys(page.frontmatter).length > 0 ? "mt-10" : "mt-8"}>
                <Suspense fallback={null}>
                  <RumiBlockEditor
                    ref={editorRef}
                    api={api}
                    databaseRefreshRevisions={databaseRefreshRevisions}
                    workspaceKey={workspaceRootPath}
                    documentKey={page.path}
                    markdown={draftBody}
                    documents={editorDocuments}
                    onOpenDocument={openDocumentLink}
                    onUploadAsset={uploadEditorAsset}
                    onMessage={setMessage}
                    highlightMisspellings={highlightMisspellings}
                    inlineReplacements={inlineReplacements}
                    emojiSuggestions={emojiSuggestions}
                    inlineToolbar={inlineToolbar}
                    allowedUploadFileTypes={allowedUploadFileTypes}
                    onDirty={() => markPageDirty("editor-autosave")}
                  />
                </Suspense>
              </div>
            </article>
          </div>
        ) : loadState === "loading" ? (
          <div className="min-h-0 flex-1" data-rumi-editor-canvas="" />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center p-8 text-muted-foreground">
            <p>Open a page from the sidebar.</p>
          </div>
        )}
      </section>

      <DeleteTrashItemDialog
        item={deleteForeverTarget}
        busy={deletingTrashId !== null}
        onOpenChange={(open) => {
          if (!open && deletingTrashId === null) setDeleteForeverTarget(null);
        }}
        onConfirm={deleteTrashItemForever}
      />

      {page && !trashOpen && !settingsOpen && (
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
      <Toaster />
    </main>
  );
}

function canMutate(node: WorkspaceNode | null): boolean {
  return Boolean(node && node.kind !== "workspace");
}

function hasUnsavedPageChanges(state: SaveState): boolean {
  return state === "dirty" || state === "saving";
}

function getViewportWidth(): number {
  return typeof window === "undefined" ? 1024 : window.innerWidth;
}

function setSidebarCollapsedState(
  collapsed: boolean,
  setCollapsed: (collapsed: boolean) => void
): void {
  saveSidebarCollapsed(collapsed);
  setCollapsed(collapsed);
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
        nodePath: node.path,
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

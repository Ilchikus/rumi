import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode
} from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { EyeSlash } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { X } from "@phosphor-icons/react/dist/csr/X";
import type { RumiApiClient } from "@rumi/api-client";
import type {
  DatabasePropertyDefinition,
  DatabasePropertyOptionColor,
  DatabasePropertyType,
  DatabaseRecord,
  DatabaseSort,
  DatabaseView as DatabaseViewConfig,
  QueryDatabaseResult,
  WorkspaceNode
} from "@rumi/contracts";
import { cn } from "../../lib/utils";
import { DatabaseOptionEditor } from "../editor/DatabaseOptionEditor";
import {
  DatabaseOptionPill,
  optionForValue,
  randomDatabaseOptionColor
} from "../editor/DatabaseOptionPill";
import { Button } from "../ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { PropertyCreateMenu } from "../editor/PropertyCreateMenu";
import {
  clampDatabaseColumnWidth,
  databaseColumnWidth,
  readDatabaseColumnWidths,
  writeDatabaseColumnWidths,
  type DatabaseColumnWidths
} from "./databasePreferences";
import { DatabaseViewTabs } from "./DatabaseViewTabs";
import { DatabaseFilterMenu } from "./DatabaseFilterMenu";

const DATABASE_PROPERTY_TYPES: ReadonlyArray<{ value: DatabasePropertyType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Select" },
  { value: "multi-select", label: "Multi-select" }
];

export const DATABASE_RECORD_BATCH_SIZE = 20;
export const DATABASE_RECORD_NAME_LAYOUT_CLASS =
  "box-border block min-h-7 w-full min-w-0 break-words whitespace-pre-wrap px-1 py-1 text-left leading-5";

interface DatabaseSelectionControlPosition {
  top: number;
  height: number;
}

interface DatabaseSelectionControlPositions {
  header: DatabaseSelectionControlPosition;
  records: Record<string, DatabaseSelectionControlPosition>;
}

export function databaseColumnWidthClass(property: string): string {
  return property === "title" ? "w-60 min-w-60" : "w-44 min-w-44";
}

export function databaseColumnStyle(
  widths: DatabaseColumnWidths,
  property: string
): { width: number; minWidth: number; maxWidth: number } {
  const width = databaseColumnWidth(widths, property);
  return { width, minWidth: width, maxWidth: width };
}

export function databaseRecordsForDisplay<T>(
  records: readonly T[],
  visibleRecordLimit: number,
  pinnedRecordPath?: string,
  recordPath: (record: T) => string = (record) => String(record)
): readonly T[] {
  const limit = Math.max(0, visibleRecordLimit);
  const visible = records.slice(0, limit);
  if (!pinnedRecordPath || visible.some((record) => recordPath(record) === pinnedRecordPath)) {
    return visible;
  }

  const pinnedRecord = records.find((record) => recordPath(record) === pinnedRecordPath);
  if (!pinnedRecord || limit === 0) return visible;
  return [pinnedRecord, ...visible.slice(0, limit - 1)];
}

export function databaseRecordTitleFromPath(recordPath: string): string {
  const fileName = recordPath.split("/").at(-1) ?? recordPath;
  return fileName.replace(/\.md$/iu, "");
}

interface DatabaseViewBaseProps {
  api: RumiApiClient;
  databasePath: string;
  preferenceScope?: string;
  refreshRevision: number;
  onOpenRecord: (recordPath: string) => void;
  onMessage: (message: string) => void;
  initialViewId?: string;
  onActiveViewChange?: (viewId: string) => void;
}

export type DatabaseViewProps = DatabaseViewBaseProps & (
  | {
      variant: "embed";
      embedSourceControl: ReactNode;
    }
  | {
      variant?: "original";
      embedSourceControl?: never;
    }
);

export function DatabaseView({
  api,
  databasePath,
  preferenceScope = "",
  refreshRevision,
  onOpenRecord,
  onMessage,
  variant = "original",
  embedSourceControl,
  initialViewId = "",
  onActiveViewChange
}: DatabaseViewProps): ReactElement {
  const [result, setResult] = useState<QueryDatabaseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingRecord, setCreatingRecord] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState(initialViewId);
  const [viewActionBusy, setViewActionBusy] = useState(false);
  const [selectedRecordPaths, setSelectedRecordPaths] = useState<Set<string>>(() => new Set());
  const [selectionAction, setSelectionAction] = useState<"duplicate" | "move" | "delete" | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTree, setMoveTree] = useState<WorkspaceNode | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [visibleRecordLimit, setVisibleRecordLimit] = useState(DATABASE_RECORD_BATCH_SIZE);
  const [recordNameEdit, setRecordNameEdit] = useState<{
    path: string;
    draft: string;
  } | null>(null);
  const [renamingRecordPath, setRenamingRecordPath] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<DatabaseColumnWidths>(() =>
    readDatabaseColumnWidths(browserStorage(), preferenceScope, databasePath, initialViewId || "all")
  );
  const [resizingColumn, setResizingColumn] = useState<{
    property: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [selectionControlPositions, setSelectionControlPositions] =
    useState<DatabaseSelectionControlPositions>({
      header: { top: 0, height: 40 },
      records: {}
    });
  const [hoveredSelectionControl, setHoveredSelectionControl] = useState<string | null>(null);
  const activeLoadRequestRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableFrameRef = useRef<HTMLDivElement>(null);
  const tableHeaderRowRef = useRef<HTMLTableRowElement>(null);
  const tableRecordRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const selectionHoverTimeoutRef = useRef<number | null>(null);
  const activeDatabasePathRef = useRef(databasePath);
  const recordMutationRef = useRef(false);
  const columnWidthsRef = useRef(columnWidths);
  activeDatabasePathRef.current = databasePath;
  columnWidthsRef.current = columnWidths;

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const cancelToolbarModes = useCallback(() => {
    setSearch("");
    setSearchOpen(false);
    setSelectedRecordPaths(new Set());
  }, []);

  useEffect(() => {
    if (!searchOpen && selectedRecordPaths.size === 0) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      cancelToolbarModes();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [cancelToolbarModes, searchOpen, selectedRecordPaths.size]);

  const load = useCallback(async (): Promise<QueryDatabaseResult | null> => {
    const requestId = activeLoadRequestRef.current + 1;
    activeLoadRequestRef.current = requestId;
    setLoading(true);

    try {
      const query = (viewId?: string) => api.queryDatabase({
        databasePath,
        ...(viewId ? { viewId } : {}),
        ...(search.trim()
          ? {
              filters: [{
                property: "title",
                operator: "contains" as const,
                value: search.trim()
              }]
            }
          : {})
      });
      let nextResult: QueryDatabaseResult;
      try {
        nextResult = await query(activeViewId || initialViewId || undefined);
      } catch (error) {
        if (!(activeViewId || initialViewId)) throw error;
        if (!errorMessage(error).includes("Database view does not exist")) throw error;
        nextResult = await query();
      }
      const resolvedViewId = nextResult.schema.views.some(
        (view) => view.id === (activeViewId || initialViewId)
      )
        ? (activeViewId || initialViewId)
        : (nextResult.schema.views[0]?.id ?? "");
      if (
        resolvedViewId &&
        resolvedViewId !== (activeViewId || initialViewId)
      ) {
        nextResult = await query(resolvedViewId);
      }
      if (
        activeLoadRequestRef.current === requestId &&
        activeDatabasePathRef.current === databasePath
      ) {
        if (resolvedViewId && resolvedViewId !== activeViewId) {
          setActiveViewId(resolvedViewId);
        }
        const savedColumnWidths = readDatabaseColumnWidths(
          browserStorage(),
          preferenceScope,
          databasePath,
          resolvedViewId || "all"
        );
        columnWidthsRef.current = savedColumnWidths;
        setColumnWidths(savedColumnWidths);
        setResult(nextResult);
        return nextResult;
      }
      return null;
    } catch (error) {
      if (
        activeLoadRequestRef.current === requestId &&
        activeDatabasePathRef.current === databasePath
      ) {
        onMessage(errorMessage(error));
      }
      return null;
    } finally {
      if (
        activeLoadRequestRef.current === requestId &&
        activeDatabasePathRef.current === databasePath
      ) {
        setLoading(false);
      }
    }
  }, [
    activeViewId,
    api,
    databasePath,
    initialViewId,
    onMessage,
    preferenceScope,
    search
  ]);

  useEffect(() => {
    if (recordMutationRef.current) return;
    const timeout = window.setTimeout(() => {
      void load();
    }, search ? 160 : 0);

    return () => window.clearTimeout(timeout);
  }, [load, refreshRevision, search]);

  const activeView = useMemo(
    () => result?.schema.views.find((view) => view.id === activeViewId)
      ?? result?.schema.views[0],
    [activeViewId, result]
  );
  const columns = useMemo(() => {
    if (!result || !activeView) return [];
    const available = new Set(Object.keys(result.schema.properties));
    return activeView.columns.filter((column) => available.has(column));
  }, [activeView, result]);
  const hiddenProperties = useMemo(
    () => Object.keys(result?.schema.properties ?? {}).filter(
      (property) => !columns.includes(property)
    ),
    [columns, result?.schema.properties]
  );

  const selectedRecords = useMemo(
    () => result?.records.filter((record) => selectedRecordPaths.has(record.path)) ?? [],
    [result?.records, selectedRecordPaths]
  );
  const displayedRecords = useMemo(
    () => databaseRecordsForDisplay(
      result?.records ?? [],
      visibleRecordLimit,
      recordNameEdit?.path,
      (record) => record.path
    ),
    [recordNameEdit?.path, result?.records, visibleRecordLimit]
  );
  const hasMoreRecords = displayedRecords.length < (result?.records.length ?? 0);
  const visibleRecordPaths = useMemo(
    () => result?.records.map((record) => record.path) ?? [],
    [result?.records]
  );
  const allVisibleRecordsSelected =
    visibleRecordPaths.length > 0 && visibleRecordPaths.every((path) => selectedRecordPaths.has(path));
  const someVisibleRecordsSelected =
    !allVisibleRecordsSelected && visibleRecordPaths.some((path) => selectedRecordPaths.has(path));
  const activeViewName = activeView?.id ?? "all";
  const sorts = activeView?.sorts ?? [];

  const measureSelectionControls = useCallback(() => {
    const frame = tableFrameRef.current;
    if (!frame) return;
    const frameRect = frame.getBoundingClientRect();
    const rowPosition = (
      row: HTMLTableRowElement | null
    ): DatabaseSelectionControlPosition | null => {
      if (!row) return null;
      const rect = row.getBoundingClientRect();
      return {
        top: rect.top - frameRect.top,
        height: rect.height
      };
    };
    const records: Record<string, DatabaseSelectionControlPosition> = {};
    for (const record of displayedRecords) {
      const position = rowPosition(tableRecordRowRefs.current.get(record.path) ?? null);
      if (position !== null) records[record.path] = position;
    }
    const next: DatabaseSelectionControlPositions = {
      header: rowPosition(tableHeaderRowRef.current) ?? { top: 0, height: 40 },
      records
    };
    setSelectionControlPositions((current) => (
      databaseSelectionControlPositionsEqual(current, next) ? current : next
    ));
  }, [displayedRecords]);

  useLayoutEffect(() => {
    measureSelectionControls();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureSelectionControls);
    if (tableFrameRef.current) observer.observe(tableFrameRef.current);
    if (tableHeaderRowRef.current) observer.observe(tableHeaderRowRef.current);
    for (const row of tableRecordRowRefs.current.values()) observer.observe(row);
    return () => observer.disconnect();
  }, [measureSelectionControls]);

  const revealSelectionControl = useCallback((key: string) => {
    if (selectionHoverTimeoutRef.current !== null) {
      window.clearTimeout(selectionHoverTimeoutRef.current);
      selectionHoverTimeoutRef.current = null;
    }
    setHoveredSelectionControl(key);
  }, []);

  const scheduleSelectionControlHide = useCallback(() => {
    if (selectionHoverTimeoutRef.current !== null) {
      window.clearTimeout(selectionHoverTimeoutRef.current);
    }
    selectionHoverTimeoutRef.current = window.setTimeout(() => {
      selectionHoverTimeoutRef.current = null;
      setHoveredSelectionControl(null);
    }, 80);
  }, []);

  useEffect(() => () => {
    if (selectionHoverTimeoutRef.current !== null) {
      window.clearTimeout(selectionHoverTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!resizingColumn) return;

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = clampDatabaseColumnWidth(
        resizingColumn.startWidth + event.clientX - resizingColumn.startX
      );
      if (columnWidthsRef.current[resizingColumn.property] === nextWidth) return;
      const next = {
        ...columnWidthsRef.current,
        [resizingColumn.property]: nextWidth
      };
      columnWidthsRef.current = next;
      setColumnWidths(next);
    };
    const finishResize = () => {
      writeDatabaseColumnWidths(
        browserStorage(),
        preferenceScope,
        databasePath,
        activeViewName,
        columnWidthsRef.current
      );
      setResizingColumn(null);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [activeViewName, databasePath, preferenceScope, resizingColumn]);

  const startColumnResize = useCallback((
    property: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingColumn({
      property,
      startX: event.clientX,
      startWidth: databaseColumnWidth(columnWidthsRef.current, property)
    });
  }, []);

  useEffect(() => {
    setSelectedRecordPaths((current) => {
      const available = new Set(visibleRecordPaths);
      const next = new Set([...current].filter((path) => available.has(path)));
      return next.size === current.size ? current : next;
    });
  }, [visibleRecordPaths]);

  useEffect(() => {
    setSelectedRecordPaths(new Set());
    setMoveDialogOpen(false);
    setMoveTree(null);
    setDeleteDialogOpen(false);
    setVisibleRecordLimit(DATABASE_RECORD_BATCH_SIZE);
    setRecordNameEdit(null);
    setRenamingRecordPath(null);
    setResizingColumn(null);
    setActiveViewId(initialViewId);
  }, [databasePath, initialViewId]);

  const toggleRecordSelection = useCallback((recordPath: string) => {
    setSelectedRecordPaths((current) => {
      const next = new Set(current);
      if (next.has(recordPath)) next.delete(recordPath);
      else next.add(recordPath);
      return next;
    });
  }, []);

  const toggleAllVisibleRecords = useCallback(() => {
    setSelectedRecordPaths((current) => {
      const next = new Set(current);
      const shouldSelect = visibleRecordPaths.some((path) => !next.has(path));
      for (const recordPath of visibleRecordPaths) {
        if (shouldSelect) next.add(recordPath);
        else next.delete(recordPath);
      }
      return next;
    });
  }, [visibleRecordPaths]);

  const createRecord = useCallback(async () => {
    if (creatingRecord) {
      return;
    }

    setCreatingRecord(true);
    recordMutationRef.current = true;

    try {
      const created = await api.createDatabaseRecord({ databasePath });
      const createdPage = await api.openPage(created.path);
      await load();
      const createdRecord: DatabaseRecord = {
        path: created.path,
        title: databaseRecordTitleFromPath(created.path),
        frontmatter: createdPage.frontmatter,
        version: createdPage.version
      };
      setResult((current) => current
        ? {
            ...current,
            records: [
              createdRecord,
              ...current.records.filter((record) => record.path !== created.path)
            ]
          }
        : current
      );
      setRecordNameEdit({
        path: created.path,
        draft: createdRecord.title
      });
    } catch (error) {
      onMessage(errorMessage(error));
    } finally {
      recordMutationRef.current = false;
      setCreatingRecord(false);
    }
  }, [api, creatingRecord, databasePath, load, onMessage]);

  const renameRecord = useCallback(async (record: DatabaseRecord, requestedName: string) => {
    if (renamingRecordPath) return;
    const nextName = requestedName.trim() || "New Page";
    if (nextName === record.title) {
      setRecordNameEdit((current) => current?.path === record.path ? null : current);
      return;
    }

    setRenamingRecordPath(record.path);
    recordMutationRef.current = true;
    try {
      const renamed = await api.renameNode({ path: record.path, newName: nextName });
      const renamedTitle = databaseRecordTitleFromPath(renamed.path);
      setResult((current) => current
        ? {
            ...current,
            records: current.records.map((candidate) =>
              candidate.path === record.path
                ? { ...candidate, path: renamed.path, title: renamedTitle }
                : candidate
            )
          }
        : current
      );
      setSelectedRecordPaths((current) => {
        if (!current.has(record.path)) return current;
        const next = new Set(current);
        next.delete(record.path);
        next.add(renamed.path);
        return next;
      });
      setRecordNameEdit((current) => current?.path === record.path ? null : current);
      await load();
    } catch (error) {
      onMessage(errorMessage(error));
    } finally {
      recordMutationRef.current = false;
      setRenamingRecordPath(null);
    }
  }, [api, load, onMessage, renamingRecordPath]);

  const duplicateSelectedRecords = useCallback(async () => {
    if (selectionAction || selectedRecords.length === 0) {
      return;
    }

    const pendingPaths = new Set(selectedRecords.map((record) => record.path));
    setSelectionAction("duplicate");

    try {
      for (const record of selectedRecords) {
        const source = await api.openPage(record.path);
        await api.createDatabaseRecord({
          databasePath,
          name: `${record.title} copy`,
          frontmatter: source.frontmatter,
          markdownBody: source.markdownBody
        });
        pendingPaths.delete(record.path);
      }
      setSelectedRecordPaths(new Set());
      await load();
    } catch (error) {
      setSelectedRecordPaths(new Set(pendingPaths));
      onMessage(errorMessage(error));
      await load();
    } finally {
      setSelectionAction(null);
    }
  }, [api, databasePath, load, onMessage, selectedRecords, selectionAction]);

  const openMoveDialog = useCallback(async () => {
    if (selectionAction || selectedRecords.length === 0) {
      return;
    }

    setMoveDialogOpen(true);
    setMoveTree(null);
    setSelectionAction("move");

    try {
      setMoveTree(await api.getTree());
    } catch (error) {
      setMoveDialogOpen(false);
      onMessage(errorMessage(error));
    } finally {
      setSelectionAction(null);
    }
  }, [api, onMessage, selectedRecords.length, selectionAction]);

  const moveSelectedRecords = useCallback(async (newParentPath: string) => {
    if (selectionAction || selectedRecords.length === 0) {
      return;
    }

    const pendingPaths = new Set(selectedRecords.map((record) => record.path));
    setSelectionAction("move");

    try {
      for (const record of selectedRecords) {
        await api.moveNode({ path: record.path, newParentPath });
        pendingPaths.delete(record.path);
      }
      setSelectedRecordPaths(new Set());
      setMoveDialogOpen(false);
      await load();
    } catch (error) {
      setSelectedRecordPaths(new Set(pendingPaths));
      onMessage(errorMessage(error));
      await load();
    } finally {
      setSelectionAction(null);
    }
  }, [api, load, onMessage, selectedRecords, selectionAction]);

  const deleteSelectedRecords = useCallback(async () => {
    if (selectionAction || selectedRecords.length === 0) {
      return;
    }

    const pendingPaths = new Set(selectedRecords.map((record) => record.path));
    setSelectionAction("delete");

    try {
      for (const record of selectedRecords) {
        await api.deleteNode({ path: record.path });
        pendingPaths.delete(record.path);
      }
      setSelectedRecordPaths(new Set());
      setDeleteDialogOpen(false);
      await load();
    } catch (error) {
      setSelectedRecordPaths(new Set(pendingPaths));
      onMessage(errorMessage(error));
      await load();
    } finally {
      setSelectionAction(null);
    }
  }, [api, load, onMessage, selectedRecords, selectionAction]);

  const updateProperty = useCallback(
    async (record: DatabaseRecord, property: string, value: unknown) => {
      const previousValue = record.frontmatter[property];

      setResult((current) =>
        current
          ? {
              ...current,
              records: current.records.map((candidate) =>
                candidate.path === record.path
                  ? { ...candidate, frontmatter: { ...candidate.frontmatter, [property]: value } }
                  : candidate
              )
            }
          : current
      );

      try {
        const saved = await api.updateDatabaseRecordProperty({
          databasePath,
          recordPath: record.path,
          baseVersion: record.version,
          property,
          value
        });

        if (saved.status === "conflict") {
          onMessage(`Could not update ${record.title}: it changed elsewhere.`);
          await load();
          return;
        }

        setResult((current) =>
          current
            ? {
                ...current,
                records: current.records.map((candidate) =>
                  candidate.path === record.path
                    ? { ...candidate, version: saved.version }
                    : candidate
                )
              }
            : current
        );
      } catch (error) {
        setResult((current) =>
          current
            ? {
                ...current,
                records: current.records.map((candidate) => {
                  if (candidate.path !== record.path) return candidate;
                  const frontmatter = { ...candidate.frontmatter };
                  if (previousValue === undefined) delete frontmatter[property];
                  else frontmatter[property] = previousValue;
                  return { ...candidate, frontmatter };
                })
              }
            : current
        );
        onMessage(errorMessage(error));
      }
    },
    [api, databasePath, load, onMessage]
  );

  const createOption = useCallback(
    async (property: string, option: string): Promise<boolean> => {
      const currentResult = result;
      const definition = currentResult?.schema.properties[property];

      if (
        !currentResult ||
        !definition ||
        (definition.type !== "select" && definition.type !== "multi-select")
      ) {
        return false;
      }

      const color = randomDatabaseOptionColor();

      try {
        const saved = await api.createDatabasePropertyOption({
          databasePath,
          baseVersion: currentResult.schemaVersion,
          property,
          option,
          color
        });

        if (saved.status === "conflict") {
          onMessage("The database options changed elsewhere. Reloaded the latest version.");
          await load();
          return false;
        }

        setResult((current) => {
          const currentDefinition = current?.schema.properties[property];
          if (
            !current ||
            !currentDefinition ||
            (currentDefinition.type !== "select" && currentDefinition.type !== "multi-select")
          ) {
            return current;
          }

          const optionExists = (currentDefinition.options ?? []).some(
            (candidate) => candidate.name.toLowerCase() === option.toLowerCase()
          );
          return {
            ...current,
            schemaVersion: optionExists ? current.schemaVersion : saved.version,
            schema: {
              ...current.schema,
              properties: {
                ...current.schema.properties,
                [property]: {
                  ...currentDefinition,
                  options: optionExists
                    ? (currentDefinition.options ?? [])
                    : [...(currentDefinition.options ?? []), { name: option, color }]
                }
              }
            }
          };
        });
        return true;
      } catch (error) {
        onMessage(errorMessage(error));
        return false;
      }
    },
    [api, databasePath, load, onMessage, result]
  );

  const updateOption = useCallback(
    async (
      property: string,
      option: string,
      update:
        | { action: "rename"; newName: string }
        | { action: "change-color"; color: DatabasePropertyOptionColor }
        | { action: "delete" }
    ): Promise<boolean> => {
      const currentResult = result;
      const definition = currentResult?.schema.properties[property];

      if (
        !currentResult ||
        !definition ||
        (definition.type !== "select" && definition.type !== "multi-select")
      ) {
        return false;
      }

      try {
        const saved = await api.updateDatabasePropertyOption({
          databasePath,
          baseVersion: currentResult.schemaVersion,
          property,
          option,
          ...update
        });

        if (saved.status === "conflict") {
          onMessage("The database options changed elsewhere. Reloaded the latest version.");
          await load();
          return false;
        }

        await load();
        return true;
      } catch (error) {
        onMessage(errorMessage(error));
        return false;
      }
    },
    [api, databasePath, load, onMessage, result]
  );

  const addProperty = useCallback(async (
    propertyName: string,
    propertyType: DatabasePropertyType
  ): Promise<boolean> => {
    if (
      !result ||
      !propertyName ||
      result.schema.properties[propertyName] ||
      result.schema.unsupportedProperties.includes(propertyName)
    ) {
      return false;
    }

    try {
      const saved = await api.createDatabaseProperty({
        databasePath,
        baseVersion: result.schemaVersion,
        property: propertyName,
        type: propertyType,
        ...(activeView ? { viewId: activeView.id } : {})
      });

      if (saved.status === "conflict") {
        onMessage("The database schema changed elsewhere. Reloaded the latest version.");
        await load();
        return false;
      }

      await load();
      return true;
    } catch (error) {
      onMessage(errorMessage(error));
      return false;
    }
  }, [activeView, api, databasePath, load, onMessage, result]);

  const renameProperty = useCallback(
    async (property: string, newName: string): Promise<boolean> => {
      if (!result) {
        return false;
      }

      const normalizedName = newName.trim();
      if (!normalizedName || normalizedName === property) {
        return false;
      }

      try {
        const saved = await api.renameDatabaseProperty({
          databasePath,
          baseVersion: result.schemaVersion,
          property,
          newName: normalizedName
        });

        if (saved.status === "conflict") {
          onMessage("The database schema changed elsewhere. Reloaded the latest version.");
          await load();
          return false;
        }

        if (columnWidthsRef.current[property] !== undefined) {
          const nextColumnWidths = { ...columnWidthsRef.current };
          nextColumnWidths[normalizedName] = nextColumnWidths[property] as number;
          delete nextColumnWidths[property];
          columnWidthsRef.current = nextColumnWidths;
          setColumnWidths(nextColumnWidths);
          writeDatabaseColumnWidths(
            browserStorage(),
            preferenceScope,
            databasePath,
            activeViewName,
            nextColumnWidths
          );
        }

        await load();
        return true;
      } catch (error) {
        onMessage(errorMessage(error));
        return false;
      }
    },
    [activeViewName, api, databasePath, load, onMessage, preferenceScope, result]
  );

  const changePropertyType = useCallback(
    async (property: string, type: DatabasePropertyType): Promise<boolean> => {
      if (!result || result.schema.properties[property]?.type === type) return false;

      try {
        const saved = await api.changeDatabasePropertyType({
          databasePath,
          baseVersion: result.schemaVersion,
          property,
          type
        });
        if (saved.status === "conflict") {
          onMessage("The database schema changed elsewhere. Reloaded the latest version.");
          await load();
          return false;
        }
        await load();
        return true;
      } catch (error) {
        onMessage(errorMessage(error));
        return false;
      }
    },
    [api, databasePath, load, onMessage, result]
  );

  const deleteProperty = useCallback(
    async (property: string): Promise<boolean> => {
      if (!result) return false;

      try {
        const saved = await api.deleteDatabaseProperty({
          databasePath,
          baseVersion: result.schemaVersion,
          property
        });
        if (saved.status === "conflict") {
          onMessage("The database schema changed elsewhere. Reloaded the latest version.");
          await load();
          return false;
        }
        await load();
        return true;
      } catch (error) {
        onMessage(errorMessage(error));
        return false;
      }
    },
    [api, databasePath, load, onMessage, result]
  );

  const selectView = useCallback((viewId: string) => {
    setVisibleRecordLimit(DATABASE_RECORD_BATCH_SIZE);
    setSelectedRecordPaths(new Set());
    setActiveViewId(viewId);
    onActiveViewChange?.(viewId);
  }, [onActiveViewChange]);

  const saveView = useCallback(async (
    view: DatabaseViewConfig
  ): Promise<boolean> => {
    if (!result || viewActionBusy) return false;
    setViewActionBusy(true);
    try {
      const saved = await api.updateDatabaseView({
        databasePath,
        baseVersion: result.schemaVersion,
        viewId: view.id,
        name: view.name,
        columns: view.columns,
        ...(view.filters && view.filters.length > 0
          ? {
              filters: view.filters,
              ...(view.filterMode ? { filterMode: view.filterMode } : {})
            }
          : {}),
        ...(view.sorts && view.sorts.length > 0 ? { sorts: view.sorts } : {})
      });
      if (saved.status === "conflict") {
        await load();
        return false;
      }
      await load();
      return true;
    } catch {
      return false;
    } finally {
      setViewActionBusy(false);
    }
  }, [api, databasePath, load, result, viewActionBusy]);

  const toggleSort = useCallback((property: string) => {
    if (!activeView) return;
    const existing = activeView.sorts?.find((sort) => sort.property === property);
    const nextSorts: DatabaseSort[] = !existing
      ? [{ property, direction: "asc" }]
      : existing.direction === "asc"
        ? [{ property, direction: "desc" }]
        : [];
    const { sorts: _sorts, ...viewWithoutSorts } = activeView;
    void saveView(nextSorts.length > 0
      ? { ...viewWithoutSorts, sorts: nextSorts }
      : viewWithoutSorts
    );
  }, [activeView, saveView]);

  const createView = useCallback(async () => {
    if (!result || viewActionBusy) return;
    const previousIds = new Set(result.schema.views.map((view) => view.id));
    setViewActionBusy(true);
    try {
      const saved = await api.createDatabaseView({
        databasePath,
        baseVersion: result.schemaVersion,
        name: "Table",
        type: "table"
      });
      if (saved.status === "conflict") {
        await load();
        return;
      }
      const next = await load();
      const created = next?.schema.views.find((view) => !previousIds.has(view.id));
      if (created) selectView(created.id);
    } catch {
      // View actions intentionally stay quiet; the current configuration remains visible.
    } finally {
      setViewActionBusy(false);
    }
  }, [api, databasePath, load, result, selectView, viewActionBusy]);

  const renameView = useCallback(async (viewId: string, name: string): Promise<boolean> => {
    const view = result?.schema.views.find((candidate) => candidate.id === viewId);
    return view ? saveView({ ...view, name }) : false;
  }, [result, saveView]);

  const duplicateView = useCallback(async (viewId: string) => {
    const view = result?.schema.views.find((candidate) => candidate.id === viewId);
    if (!result || !view || viewActionBusy) return;
    const previousIds = new Set(result.schema.views.map((candidate) => candidate.id));
    setViewActionBusy(true);
    try {
      const saved = await api.createDatabaseView({
        databasePath,
        baseVersion: result.schemaVersion,
        name: `${view.name} copy`,
        type: "table",
        sourceViewId: view.id
      });
      if (saved.status === "conflict") {
        await load();
        return;
      }
      const next = await load();
      const created = next?.schema.views.find((candidate) => !previousIds.has(candidate.id));
      if (created) selectView(created.id);
    } catch {
      // View actions intentionally stay quiet; the current configuration remains visible.
    } finally {
      setViewActionBusy(false);
    }
  }, [api, databasePath, load, result, selectView, viewActionBusy]);

  const deleteView = useCallback(async (viewId: string) => {
    if (!result || viewActionBusy || result.schema.views.length <= 1) return;
    setViewActionBusy(true);
    try {
      const saved = await api.deleteDatabaseView({
        databasePath,
        baseVersion: result.schemaVersion,
        viewId
      });
      if (saved.status === "conflict") {
        await load();
        return;
      }
      const fallback = result.schema.views.find((view) => view.id !== viewId);
      if (viewId === activeViewId && fallback) selectView(fallback.id);
      await load();
    } catch {
      // View actions intentionally stay quiet; the current configuration remains visible.
    } finally {
      setViewActionBusy(false);
    }
  }, [
    activeViewId,
    api,
    databasePath,
    load,
    result,
    selectView,
    viewActionBusy
  ]);

  const saveFilters = useCallback(async (
    filters: NonNullable<DatabaseViewConfig["filters"]>,
    filterMode: "and" | "or"
  ): Promise<boolean> => {
    if (!activeView) return false;
    const {
      filters: _filters,
      filterMode: _filterMode,
      ...viewWithoutFilters
    } = activeView;
    return saveView(filters.length > 0
      ? { ...viewWithoutFilters, filters, filterMode }
      : viewWithoutFilters
    );
  }, [activeView, saveView]);

  const setViewPropertyVisible = useCallback(async (
    property: string,
    visible: boolean
  ): Promise<boolean> => {
    if (!activeView) return false;
    const columns = visible
      ? activeView.columns.includes(property)
        ? activeView.columns
        : [...activeView.columns, property]
      : activeView.columns.filter((column) => column !== property);
    return saveView({ ...activeView, columns });
  }, [activeView, saveView]);

  const viewTabs = result ? (
    <DatabaseViewTabs
      views={result.schema.views}
      activeViewId={activeView?.id ?? ""}
      busy={viewActionBusy}
      onSelect={selectView}
      onCreate={() => void createView()}
      onRename={renameView}
      onDuplicate={(viewId) => void duplicateView(viewId)}
      onDelete={(viewId) => void deleteView(viewId)}
    />
  ) : null;

  return (
    <section
      className="mt-8 w-full min-w-0 max-w-full"
      aria-label="Database records"
      aria-busy={loading}
    >
      {selectedRecords.length > 0 ? (
        <div
          className="mb-1.5 flex h-12 min-w-0 flex-nowrap items-center gap-2 py-1"
          data-database-toolbar="true"
          data-database-selection-actions="true"
        >
          {viewTabs}
          <div className="relative ml-auto h-10 shrink-0">
            <DatabaseToolbarFade />
            <div
              className="relative z-10 flex h-10 items-center gap-1 bg-white"
              data-database-selection-surface="true"
            >
              <button
                type="button"
                className="group/clear-selection mr-2 grid h-8 grid-cols-1 items-center text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                aria-label={`Clear all ${selectedRecords.length} selected records`}
                disabled={selectionAction !== null}
                onClick={() => setSelectedRecordPaths(new Set())}
              >
                <span className="col-start-1 row-start-1 group-hover/clear-selection:opacity-0 group-focus-visible/clear-selection:opacity-0">
                  {selectedRecords.length} selected
                </span>
                <span className="col-start-1 row-start-1 text-sky-600 underline underline-offset-2 opacity-0 group-hover/clear-selection:opacity-100 group-focus-visible/clear-selection:opacity-100">
                  Clear all
                </span>
              </button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={selectionAction !== null}
                onClick={() => void duplicateSelectedRecords()}
              >
                <Copy size={15} />
                {selectionAction === "duplicate" ? "Duplicating" : "Duplicate"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={selectionAction !== null}
                onClick={() => void openMoveDialog()}
              >
                <ArrowRight size={15} />
                Move
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-destructive hover:text-destructive"
                disabled={selectionAction !== null}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash size={15} />
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="mb-1.5 flex h-12 min-w-0 flex-nowrap items-center gap-2 py-1"
          data-database-toolbar="true"
        >
          {viewTabs}
          <div className="ml-auto flex h-10 items-center gap-1.5">
            <div
              className={cn(
                "relative z-40 flex h-10 shrink-0 items-center",
                searchOpen ? "w-56" : "w-8"
              )}
            >
              {searchOpen ? (
                <div className="absolute bottom-0 right-0 z-50 h-10 w-56">
                  <DatabaseToolbarFade />
                  <div
                    className="relative z-10 flex h-10 w-full items-center border-b border-border bg-white"
                    data-database-search-surface="true"
                  >
                    <MagnifyingGlass
                      size={15}
                      className="ml-2 shrink-0 text-neutral-500"
                      aria-hidden="true"
                    />
                    <input
                      ref={searchInputRef}
                      value={search}
                      className="h-full min-w-0 flex-1 bg-white px-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
                      placeholder="Search records"
                      aria-label="Search records"
                      onChange={(event) => {
                        setVisibleRecordLimit(DATABASE_RECORD_BATCH_SIZE);
                        setSearch(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelToolbarModes();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                      aria-label="Close search"
                      onClick={() => {
                        setSearch("");
                        setSearchOpen(false);
                      }}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Search database"
                  title="Search"
                  onClick={() => setSearchOpen(true)}
                >
                  <MagnifyingGlass size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {activeView && result && (
              <DatabaseFilterMenu
                properties={result.schema.properties}
                filters={activeView.filters ?? []}
                {...(activeView.filterMode ? { filterMode: activeView.filterMode } : {})}
                disabled={viewActionBusy}
                onChange={saveFilters}
              />
            )}
            {variant === "embed" ? embedSourceControl : null}
            <Button type="button" size="sm" onClick={() => void createRecord()} disabled={creatingRecord}>
              <Plus size={15} />
              {creatingRecord ? "Creating" : "New"}
            </Button>
          </div>
        </div>
      )}

      <div
        ref={tableFrameRef}
        className="relative w-full min-w-0 max-w-full"
        data-database-table-frame="true"
      >
        <div
          className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain"
          data-database-table-scroll="true"
        >
          <table className="w-max min-w-[max(100%,620px)] border-separate border-spacing-0 text-sm">
            <thead className="group/table-header sticky top-0 z-10 bg-white text-left text-xs font-medium text-neutral-600">
              <tr
                ref={tableHeaderRowRef}
                className="h-10"
                onPointerEnter={() => revealSelectionControl("header")}
                onPointerLeave={scheduleSelectionControlHide}
              >
                <SortableHeader
                  label="Name"
                  property="title"
                  width={databaseColumnWidth(columnWidths, "title")}
                  resizing={resizingColumn?.property === "title"}
                  sorts={sorts}
                  hiddenProperties={hiddenProperties}
                  onShowProperty={(property) => setViewPropertyVisible(property, true)}
                  onSort={toggleSort}
                  onResizeStart={startColumnResize}
                />
                {columns.map((column) => (
                  <SortableHeader
                    key={column}
                    label={column}
                    property={column}
                    width={databaseColumnWidth(columnWidths, column)}
                    resizing={resizingColumn?.property === column}
                    definition={result?.schema.properties[column]}
                    sorts={sorts}
                    hiddenProperties={hiddenProperties}
                    onShowProperty={(property) => setViewPropertyVisible(property, true)}
                    onSort={toggleSort}
                    onResizeStart={startColumnResize}
                    onRename={(newName) => renameProperty(column, newName)}
                    onChangeType={(type) => changePropertyType(column, type)}
                    onHide={() => setViewPropertyVisible(column, false)}
                    onDelete={() => deleteProperty(column)}
                  />
                ))}
                <th className="w-12 min-w-12 max-w-12 border-y border-border bg-white px-2 py-1.5">
                  <PropertyCreateMenu
                    types={DATABASE_PROPERTY_TYPES}
                    existingNames={[
                      ...Object.keys(result?.schema.properties ?? {}),
                      ...(result?.schema.unsupportedProperties ?? [])
                    ]}
                    disabled={!result}
                    onCreate={addProperty}
                    trigger={(
                      <button
                        type="button"
                        className="grid h-6 w-7 place-items-center rounded hover:bg-background"
                        aria-label="Add property"
                        title="Add property"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedRecords.map((record) => (
                <tr
                  ref={(element) => {
                    if (element) tableRecordRowRefs.current.set(record.path, element);
                    else tableRecordRowRefs.current.delete(record.path);
                  }}
                  key={record.path}
                  className={cn(
                    "group hover:bg-muted/30 last:[&>td]:border-b-0",
                    selectedRecordPaths.has(record.path) && "bg-muted/55"
                  )}
                  data-database-record-selected={selectedRecordPaths.has(record.path) ? "true" : undefined}
                  onPointerEnter={() => revealSelectionControl(record.path)}
                  onPointerLeave={scheduleSelectionControlHide}
                >
                  <td
                    className="group/name relative w-60 min-w-60 border-b border-border p-1 font-medium"
                    style={databaseColumnStyle(columnWidths, "title")}
                  >
                    <DatabaseRecordNameCell
                      record={record}
                      edit={recordNameEdit?.path === record.path ? recordNameEdit : null}
                      saving={renamingRecordPath === record.path}
                      onStartEditing={() => setRecordNameEdit({
                        path: record.path,
                        draft: record.title
                      })}
                      onChange={(draft) => setRecordNameEdit((current) =>
                        current?.path === record.path ? { ...current, draft } : current
                      )}
                      onCommit={(draft) => void renameRecord(record, draft)}
                      onOpen={() => onOpenRecord(record.path)}
                    />
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column}
                      className="w-44 min-w-44 border-b border-border px-2 py-1"
                      style={databaseColumnStyle(columnWidths, column)}
                    >
                      <PropertyCell
                        property={column}
                        definition={result?.schema.properties[column] ?? { type: "text" }}
                        value={record.frontmatter[column]}
                        onChange={(value) => void updateProperty(record, column, value)}
                        onCreateOption={(option) => createOption(column, option)}
                        onChangeOptionColor={(option, color) =>
                          updateOption(column, option, { action: "change-color", color })
                        }
                        onRenameOption={(option, newName) =>
                          updateOption(column, option, { action: "rename", newName })
                        }
                        onDeleteOption={(option) =>
                          updateOption(column, option, { action: "delete" })
                        }
                      />
                    </td>
                  ))}
                  <td className="w-12 min-w-12 max-w-12 border-b border-border" />
                </tr>
              ))}
            </tbody>
          </table>

          {result?.records.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {search ? "No records match this filter." : "No records yet. Create the first one."}
            </div>
          )}
          {loading && !result && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading records…</div>
          )}
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 -left-7 z-30 w-7"
          data-database-selection-overlay="true"
        >
          <div
            className="group/selection-target pointer-events-auto absolute left-0 w-7"
            style={{
              top: selectionControlPositions.header.top,
              height: selectionControlPositions.header.height
            }}
            data-database-selection-control="all"
            data-rumi-area-selection-exclude="true"
            onPointerEnter={() => revealSelectionControl("header")}
            onPointerLeave={scheduleSelectionControlHide}
          >
            <div
              className={cn(
                "grid h-full w-5 place-items-center opacity-0 group-hover/selection-target:opacity-100 group-focus-within/selection-target:opacity-100",
                (
                  hoveredSelectionControl === "header"
                  || allVisibleRecordsSelected
                  || someVisibleRecordsSelected
                ) && "opacity-100"
              )}
            >
              <SelectionCheckbox
                ariaLabel="Select all records"
                checked={allVisibleRecordsSelected}
                mixed={someVisibleRecordsSelected}
                disabled={visibleRecordPaths.length === 0 || selectionAction !== null}
                onChange={toggleAllVisibleRecords}
              />
            </div>
          </div>
          {displayedRecords.map((record) => {
            const position = selectionControlPositions.records[record.path];
            if (position === undefined) return null;
            return (
              <div
                key={record.path}
                className="group/selection-target pointer-events-auto absolute left-0 w-7"
                style={{ top: position.top, height: position.height }}
                data-database-selection-control="record"
                data-rumi-area-selection-exclude="true"
                onPointerEnter={() => revealSelectionControl(record.path)}
                onPointerLeave={scheduleSelectionControlHide}
              >
                <div
                  className={cn(
                    "grid h-full w-5 place-items-center opacity-0 group-hover/selection-target:opacity-100 group-focus-within/selection-target:opacity-100",
                    (
                      hoveredSelectionControl === record.path
                      || selectedRecordPaths.has(record.path)
                    ) && "opacity-100"
                  )}
                >
                  <SelectionCheckbox
                    ariaLabel={`Select ${record.title}`}
                    checked={selectedRecordPaths.has(record.path)}
                    disabled={selectionAction !== null}
                    onChange={() => toggleRecordSelection(record.path)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hasMoreRecords && (
        <div className="mt-3 flex justify-center" data-database-load-more="true">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              setVisibleRecordLimit((current) =>
                Math.min(current + DATABASE_RECORD_BATCH_SIZE, result?.records.length ?? current)
              )
            }
          >
            Load more
          </Button>
        </div>
      )}

      <DatabaseRecordMoveDialog
        open={moveDialogOpen}
        tree={moveTree}
        currentDatabasePath={databasePath}
        recordCount={selectedRecords.length}
        busy={selectionAction === "move"}
        onOpenChange={(open) => {
          if (selectionAction === null) setMoveDialogOpen(open);
        }}
        onConfirm={moveSelectedRecords}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (selectionAction === null) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
                <WarningCircle size={18} weight="fill" />
              </span>
              <AlertDialogTitle>Move selected records to Trash</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Move {selectedRecords.length} selected {selectedRecords.length === 1 ? "record" : "records"} to
              Trash? You can restore {selectedRecords.length === 1 ? "it" : "them"} later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelButton disabled={selectionAction !== null}>Cancel</AlertDialogCancelButton>
            <AlertDialogActionButton
              variant="destructive"
              disabled={selectionAction !== null}
              onClick={(event) => {
                event.preventDefault();
                void deleteSelectedRecords();
              }}
            >
              {selectionAction === "delete" ? "Moving" : "Move to Trash"}
            </AlertDialogActionButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function DatabaseToolbarFade(): ReactElement {
  return (
    <div
      className="pointer-events-none absolute -left-[44px] top-0 h-10 w-[44px] bg-gradient-to-r from-white/0 via-white/50 via-[30%] to-white"
      aria-hidden="true"
      data-database-toolbar-fade="true"
    />
  );
}

function databaseSelectionControlPositionsEqual(
  left: DatabaseSelectionControlPositions,
  right: DatabaseSelectionControlPositions
): boolean {
  const leftEntries = Object.entries(left.records);
  const rightEntries = Object.entries(right.records);
  return databaseSelectionControlPositionEqual(left.header, right.header)
    && leftEntries.length === rightEntries.length
    && leftEntries.every(([path, position]) => {
      const rightPosition = right.records[path];
      return Boolean(
        rightPosition && databaseSelectionControlPositionEqual(position, rightPosition)
      );
    });
}

function databaseSelectionControlPositionEqual(
  left: DatabaseSelectionControlPosition,
  right: DatabaseSelectionControlPosition
): boolean {
  return left.top === right.top && left.height === right.height;
}

function SelectionCheckbox({
  ariaLabel,
  checked,
  mixed = false,
  disabled = false,
  onChange
}: {
  ariaLabel: string;
  checked: boolean;
  mixed?: boolean;
  disabled?: boolean;
  onChange: () => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = mixed;
    }
  }, [mixed]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      className="h-3.5 w-3.5 cursor-pointer accent-sky-600 disabled:cursor-default"
      aria-label={ariaLabel}
      aria-checked={mixed ? "mixed" : checked}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

interface DatabaseMoveDestination {
  path: string;
  name: string;
  kind: WorkspaceNode["kind"];
  depth: number;
  disabled: boolean;
}

export function databaseRecordMoveDestinations(
  tree: WorkspaceNode,
  currentDatabasePath: string
): DatabaseMoveDestination[] {
  const destinations: DatabaseMoveDestination[] = [];

  const visit = (node: WorkspaceNode, depth: number) => {
    if (node.kind !== "workspace" && node.kind !== "folder" && node.kind !== "database") {
      return;
    }

    destinations.push({
      path: node.path,
      name: node.kind === "workspace" ? "Workspace root" : displayWorkspaceNodeName(node.name),
      kind: node.kind,
      depth,
      disabled: node.path === currentDatabasePath
    });

    for (const child of node.children ?? []) {
      if (child.kind === "folder" || child.kind === "database") {
        visit(child, depth + 1);
      }
    }
  };

  visit(tree, 0);
  return destinations;
}

function DatabaseRecordMoveDialog({
  open,
  tree,
  currentDatabasePath,
  recordCount,
  busy,
  onOpenChange,
  onConfirm
}: {
  open: boolean;
  tree: WorkspaceNode | null;
  currentDatabasePath: string;
  recordCount: number;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newParentPath: string) => Promise<void>;
}): ReactElement {
  const destinations = useMemo(
    () => tree ? databaseRecordMoveDestinations(tree, currentDatabasePath) : [],
    [currentDatabasePath, tree]
  );
  const [selectedPath, setSelectedPath] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedPath("");
      return;
    }

    setSelectedPath((current) => {
      const currentDestination = destinations.find(
        (destination) => destination.path === current && !destination.disabled
      );
      return currentDestination?.path ?? destinations.find((destination) => !destination.disabled)?.path ?? "";
    });
  }, [destinations, open]);

  const selectedDestination = destinations.find(
    (destination) => destination.path === selectedPath && !destination.disabled
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move selected records</DialogTitle>
          <DialogDescription>
            Choose a folder or database for {recordCount} selected {recordCount === 1 ? "record" : "records"}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-auto rounded-md border border-border p-1">
          {!tree ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Loading destinations…</p>
          ) : destinations.length > 0 ? (
            destinations.map((destination) => {
              const selected = selectedDestination?.path === destination.path;

              return (
                <button
                  key={destination.path || "__root__"}
                  type="button"
                  disabled={busy || destination.disabled}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-sm pr-2 text-left text-sm outline-none",
                    "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    selected && "bg-accent text-accent-foreground",
                    destination.disabled && "cursor-not-allowed opacity-50"
                  )}
                  style={{ paddingLeft: 8 + destination.depth * 20 }}
                  aria-current={selected ? "true" : undefined}
                  title={destination.disabled ? "Current database" : undefined}
                  onClick={() => setSelectedPath(destination.path)}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center text-neutral-400">
                    {destination.kind === "database" ? <Table size={16} /> : <Folder size={16} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{destination.name}</span>
                  {destination.disabled && (
                    <span className="shrink-0 text-xs text-muted-foreground">Current</span>
                  )}
                </button>
              );
            })
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">No destination folders found.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !selectedDestination}
            onClick={() => {
              if (selectedDestination) void onConfirm(selectedDestination.path);
            }}
          >
            {busy ? "Moving" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function displayWorkspaceNodeName(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

function SortableHeader({
  label,
  property,
  width,
  resizing,
  definition,
  sorts,
  hiddenProperties,
  onSort,
  onResizeStart,
  onRename,
  onChangeType,
  onHide,
  onShowProperty,
  onDelete
}: {
  label: string;
  property: string;
  width: number;
  resizing: boolean;
  definition?: DatabasePropertyDefinition | undefined;
  sorts: DatabaseSort[];
  hiddenProperties: readonly string[];
  onSort: (property: string) => void;
  onResizeStart: (property: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onRename?: ((newName: string) => Promise<boolean>) | undefined;
  onChangeType?: ((type: DatabasePropertyType) => Promise<boolean>) | undefined;
  onHide?: (() => Promise<boolean>) | undefined;
  onShowProperty: (property: string) => Promise<boolean>;
  onDelete?: (() => Promise<boolean>) | undefined;
}): ReactElement {
  const direction = sorts.find((sort) => sort.property === property)?.direction;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(label);
  const [busy, setBusy] = useState(false);
  const schemaManageable = Boolean(definition && onRename && onChangeType && onHide && onDelete);
  const manageable = schemaManageable || hiddenProperties.length > 0;

  const commitRename = async () => {
    if (!onRename || busy) return;
    const nextName = renameDraft.trim();
    if (!nextName || nextName === label) {
      setRenameDraft(label);
      setRenaming(false);
      return;
    }
    setBusy(true);
    if (await onRename(nextName)) setRenaming(false);
    setBusy(false);
  };

  return (
    <th
      className={cn(
        "group/header relative border-y border-border px-2 py-1.5",
        databaseColumnWidthClass(property)
      )}
      style={{ width, minWidth: width, maxWidth: width }}
      onContextMenu={(event) => {
        if (!manageable) return;
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <div className="flex items-center gap-0.5">
        {renaming ? (
          <input
            autoFocus
            aria-label={`Rename ${label} property`}
            className="h-7 min-w-24 flex-1 rounded border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
            value={renameDraft}
            disabled={busy}
            onChange={(event) => setRenameDraft(event.currentTarget.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setRenameDraft(label);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="flex min-h-6 w-full items-center gap-1 rounded px-1 text-left hover:bg-background"
            onClick={() => onSort(property)}
          >
            <span className="break-words whitespace-normal">{label}</span>
            {direction === "asc" ? <CaretUp size={12} /> : direction === "desc" ? <CaretDown size={12} /> : null}
          </button>
        )}
        {manageable && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-background"
                aria-label={`Edit ${label} property`}
                title="Property options"
              >
                <DotsThree size={14} weight="bold" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
              {definition && onRename && onChangeType && onHide && onDelete && (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setRenameDraft(label);
                      setRenaming(true);
                    }}
                  >
                    <PencilSimple size={16} aria-hidden="true" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Change type</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {DATABASE_PROPERTY_TYPES.map((type) => (
                        <DropdownMenuItem
                          key={type.value}
                          disabled={definition.type === type.value}
                          onSelect={() => void onChangeType(type.value)}
                        >
                          <span className="flex w-4 justify-center" aria-hidden="true">
                            {definition.type === type.value && <Check size={14} />}
                          </span>
                          {type.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onSelect={() => void onHide()}>
                    <EyeSlash size={16} aria-hidden="true" />
                    Hide in this view
                  </DropdownMenuItem>
                </>
              )}
              {hiddenProperties.length > 0 && (
                <>
                  {schemaManageable && <DropdownMenuSeparator />}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Show property</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                      {hiddenProperties.map((hiddenProperty) => (
                        <DropdownMenuItem
                          key={hiddenProperty}
                          onSelect={() => void onShowProperty(hiddenProperty)}
                        >
                          {hiddenProperty}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              {schemaManageable && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => void onDelete()}
                  >
                    <Trash size={16} aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <button
        type="button"
        aria-label={`Resize ${label} column`}
        data-database-column-resizer={property}
        className={cn(
          "absolute -right-1 top-0 z-20 h-full w-2 touch-none cursor-col-resize select-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 group-hover/header:after:bg-border hover:after:bg-sky-600 focus-visible:after:bg-sky-600",
          resizing && "after:bg-sky-600"
        )}
        onPointerDown={(event) => onResizeStart(property, event)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </th>
  );
}

function DatabaseRecordNameCell({
  record,
  edit,
  saving,
  onStartEditing,
  onChange,
  onCommit,
  onOpen
}: {
  record: DatabaseRecord;
  edit: { path: string; draft: string } | null;
  saving: boolean;
  onStartEditing: () => void;
  onChange: (draft: string) => void;
  onCommit: (draft: string) => void;
  onOpen: () => void;
}): ReactElement {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const connectInput = useCallback((input: HTMLTextAreaElement | null) => {
    inputRef.current = input;
    if (input) resizeTextarea(input);
  }, []);

  useLayoutEffect(() => {
    if (!edit) return;
    const input = inputRef.current;
    if (!input) return;
    resizeTextarea(input);
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [edit?.path]);

  useLayoutEffect(() => {
    if (inputRef.current) resizeTextarea(inputRef.current);
  }, [edit?.draft]);

  return (
    <div className="relative min-h-7 w-full pr-7">
      {edit ? (
        <textarea
          ref={connectInput}
          rows={1}
          wrap="soft"
          aria-label={`Rename ${record.title}`}
          data-database-record-name-editor="true"
          className={cn(
            DATABASE_RECORD_NAME_LAYOUT_CLASS,
            "resize-none overflow-hidden border-0 bg-transparent outline-none"
          )}
          value={edit.draft}
          disabled={saving}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={(event) => onCommit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-label={`Edit ${record.title}`}
          className={cn(DATABASE_RECORD_NAME_LAYOUT_CLASS, "rounded focus:outline-none")}
          onClick={onStartEditing}
        >
          <span className="block">{record.title}</span>
        </button>
      )}
      {!edit && (
        <button
          type="button"
          aria-label={`Open ${record.title}`}
          title={`Open ${record.title}`}
          className="absolute right-0 top-0 grid h-7 w-7 place-items-center rounded text-muted-foreground opacity-0 outline-none hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring group-hover/name:opacity-100"
          onClick={onOpen}
        >
          <ArrowSquareOut size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function PropertyCell({
  property,
  definition,
  value,
  onChange,
  onCreateOption,
  onChangeOptionColor,
  onRenameOption,
  onDeleteOption
}: {
  property: string;
  definition: DatabasePropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  onCreateOption: (option: string) => Promise<boolean>;
  onChangeOptionColor: (option: string, color: DatabasePropertyOptionColor) => Promise<boolean>;
  onRenameOption: (option: string, newName: string) => Promise<boolean>;
  onDeleteOption: (option: string) => Promise<boolean>;
}): ReactElement {
  if (definition.type === "checkbox") {
    return (
      <label className="grid h-7 w-8 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={value === true}
          className="h-4 w-4 accent-sky-600"
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  if (definition.type === "select" || definition.type === "multi-select") {
    return (
      <DatabaseTableOptionCell
        property={property}
        mode={definition.type}
        value={value}
        options={definition.options ?? []}
        onChange={onChange}
        onCreateOption={onCreateOption}
        onChangeOptionColor={onChangeOptionColor}
        onRenameOption={onRenameOption}
        onDeleteOption={onDeleteOption}
      />
    );
  }

  if (definition.type === "text") {
    return (
      <textarea
        defaultValue={inputValue(value, definition.type)}
        key={`${definition.type}:${inputValue(value, definition.type)}`}
        rows={1}
        wrap="soft"
        data-database-text-cell="true"
        className="min-h-7 w-full min-w-28 resize-none overflow-hidden break-words whitespace-pre-wrap rounded border-0 bg-transparent px-1 py-1 leading-5 outline-none focus:bg-background focus:ring-1 focus:ring-ring"
        placeholder="Empty"
        ref={(textarea) => {
          if (textarea) resizeTextarea(textarea);
        }}
        onInput={(event) => resizeTextarea(event.currentTarget)}
        onBlur={(event) => onChange(parseInput(event, definition.type))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <input
      type={definition.type === "number" ? "number" : definition.type === "date" ? "date" : "text"}
      defaultValue={inputValue(value, definition.type)}
      key={`${definition.type}:${inputValue(value, definition.type)}`}
      className="h-7 w-full min-w-28 rounded border-0 bg-transparent px-1 outline-none focus:bg-background focus:ring-1 focus:ring-ring"
      placeholder="Empty"
      onBlur={(event) => onChange(parseInput(event, definition.type))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function DatabaseTableOptionCell({
  property,
  mode,
  value,
  options,
  onChange,
  onCreateOption,
  onChangeOptionColor,
  onRenameOption,
  onDeleteOption
}: {
  property: string;
  mode: "select" | "multi-select";
  value: unknown;
  options: NonNullable<DatabasePropertyDefinition["options"]>;
  onChange: (value: unknown) => void;
  onCreateOption: (option: string) => Promise<boolean>;
  onChangeOptionColor: (option: string, color: DatabasePropertyOptionColor) => Promise<boolean>;
  onRenameOption: (option: string, newName: string) => Promise<boolean>;
  onDeleteOption: (option: string) => Promise<boolean>;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const selected = mode === "multi-select"
    ? Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : []
    : typeof value === "string" && value
      ? [value]
      : [];

  if (editing) {
    return (
      <DatabaseOptionEditor
        mode={mode}
        value={value}
        options={options}
        disabled={false}
        onChange={onChange}
        onCreateOption={onCreateOption}
        onChangeOptionColor={onChangeOptionColor}
        onRenameOption={onRenameOption}
        onDeleteOption={onDeleteOption}
        onFinish={() => setEditing(false)}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`Edit ${property}`}
      className="flex min-h-7 min-w-28 flex-wrap items-center gap-1 rounded px-1 text-left hover:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      onClick={() => setEditing(true)}
    >
      {selected.length > 0 ? (
        selected.map((item) => (
          <DatabaseOptionPill
            key={item}
            option={optionForValue(item, options)}
          />
        ))
      ) : (
        <span className="text-muted-foreground">Empty</span>
      )}
    </button>
  );
}

function inputValue(value: unknown, type: DatabasePropertyType): string | number {
  if (type === "multi-select" && Array.isArray(value)) {
    return value.join(", ");
  }

  return typeof value === "string" || typeof value === "number" ? value : "";
}

function resizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function parseInput(
  event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | {
    target: HTMLInputElement | HTMLTextAreaElement;
  },
  type: DatabasePropertyType
): unknown {
  const value = event.target.value.trim();

  if (!value) {
    return undefined;
  }

  if (type === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  if (type === "multi-select") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Database request failed";
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

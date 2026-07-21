import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import type { RumiApiClient } from "@rumi/api-client";
import type {
  DatabasePropertyDefinition,
  DatabasePropertyOptionColor,
  DatabasePropertyType,
  DatabaseRecord,
  DatabaseSort,
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
import { Input } from "../ui/input";
import {
  addDatabasePropertyToPrimaryView,
  databasePropertyDefinition
} from "./databaseSchema";

const DATABASE_PROPERTY_TYPES: ReadonlyArray<{ value: DatabasePropertyType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Select" },
  { value: "multi-select", label: "Multi-select" }
];

export const DATABASE_RECORD_BATCH_SIZE = 20;

export function databaseRecordsForDisplay<T>(
  records: readonly T[],
  visibleRecordLimit: number
): readonly T[] {
  return records.slice(0, Math.max(0, visibleRecordLimit));
}

export interface DatabaseViewProps {
  api: RumiApiClient;
  databasePath: string;
  refreshRevision: number;
  onOpenRecord: (recordPath: string) => void;
  onMessage: (message: string) => void;
}

export function DatabaseView({
  api,
  databasePath,
  refreshRevision,
  onOpenRecord,
  onMessage
}: DatabaseViewProps): ReactElement {
  const [result, setResult] = useState<QueryDatabaseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingRecord, setCreatingRecord] = useState(false);
  const [search, setSearch] = useState("");
  const [sorts, setSorts] = useState<DatabaseSort[]>([]);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyType, setNewPropertyType] = useState<DatabasePropertyType>("text");
  const [addingProperty, setAddingProperty] = useState(false);
  const [selectedRecordPaths, setSelectedRecordPaths] = useState<Set<string>>(() => new Set());
  const [selectionAction, setSelectionAction] = useState<"duplicate" | "move" | "delete" | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTree, setMoveTree] = useState<WorkspaceNode | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [visibleRecordLimit, setVisibleRecordLimit] = useState(DATABASE_RECORD_BATCH_SIZE);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const nextResult = await api.queryDatabase({
        databasePath,
        ...(search.trim()
          ? {
              filters: [
                {
                  property: "title",
                  operator: "contains" as const,
                  value: search.trim()
                }
              ]
            }
          : {}),
        ...(sorts.length > 0 ? { sorts } : {})
      });
      setResult(nextResult);
    } catch (error) {
      onMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [api, databasePath, onMessage, search, sorts]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, search ? 160 : 0);

    return () => window.clearTimeout(timeout);
  }, [load, refreshRevision, search]);

  const columns = useMemo(() => {
    if (!result) {
      return [];
    }

    const activeView = result.schema.views[0];
    const configured = activeView?.columns ?? [];
    const available = Object.keys(result.schema.properties);
    return configured.length > 0
      ? [...configured.filter((column) => available.includes(column)), ...available.filter((column) => !configured.includes(column))]
      : available;
  }, [result]);

  const selectedRecords = useMemo(
    () => result?.records.filter((record) => selectedRecordPaths.has(record.path)) ?? [],
    [result?.records, selectedRecordPaths]
  );
  const displayedRecords = useMemo(
    () => databaseRecordsForDisplay(result?.records ?? [], visibleRecordLimit),
    [result?.records, visibleRecordLimit]
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
  }, [databasePath]);

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

    try {
      const created = await api.createDatabaseRecord({ databasePath });
      await load();
      onOpenRecord(created.path);
    } catch (error) {
      onMessage(errorMessage(error));
    } finally {
      setCreatingRecord(false);
    }
  }, [api, creatingRecord, databasePath, load, onMessage, onOpenRecord]);

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

  const addProperty = useCallback(async () => {
    const propertyName = newPropertyName.trim();

    if (
      !result ||
      !propertyName ||
      result.schema.properties[propertyName] ||
      result.schema.unsupportedProperties.includes(propertyName)
    ) {
      return;
    }

    const definition = databasePropertyDefinition(newPropertyType);
    const properties = { ...result.schema.properties, [propertyName]: definition };
    const views = addDatabasePropertyToPrimaryView(result.schema.views, propertyName);

    try {
      const saved = await api.updateDatabaseSchema({
        databasePath,
        baseVersion: result.schemaVersion,
        properties,
        views
      });

      if (saved.status === "conflict") {
        onMessage("The database schema changed elsewhere. Reloaded the latest version.");
      } else {
        setNewPropertyName("");
        setAddingProperty(false);
      }

      await load();
    } catch (error) {
      onMessage(errorMessage(error));
    }
  }, [api, databasePath, load, newPropertyName, newPropertyType, onMessage, result]);

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

        await load();
        return true;
      } catch (error) {
        onMessage(errorMessage(error));
        return false;
      }
    },
    [api, databasePath, load, onMessage, result]
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

  const toggleSort = useCallback((property: string) => {
    setVisibleRecordLimit(DATABASE_RECORD_BATCH_SIZE);
    setSorts((current) => {
      const existing = current.find((sort) => sort.property === property);

      if (!existing) {
        return [{ property, direction: "asc" }];
      }

      if (existing.direction === "asc") {
        return [{ property, direction: "desc" }];
      }

      return [];
    });
  }, []);

  return (
    <section className="mt-8 w-full min-w-0 max-w-full" aria-label="Database records">
      {selectedRecords.length > 0 ? (
        <div
          className="mb-3 flex min-h-8 flex-wrap items-center gap-1 rounded-md bg-muted/70 px-2 py-1"
          data-database-selection-actions="true"
        >
          <span className="mr-2 text-xs font-medium text-muted-foreground">
            {selectedRecords.length} selected
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
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
            className="text-destructive hover:text-destructive"
            disabled={selectionAction !== null}
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash size={15} />
            Delete
          </Button>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            value={search}
            className="h-8 max-w-xs"
            placeholder="Filter records"
            aria-label="Filter records"
            onChange={(event) => {
              setVisibleRecordLimit(DATABASE_RECORD_BATCH_SIZE);
              setSearch(event.target.value);
            }}
          />
          <div className="ml-auto flex items-center gap-1.5">
            <Button type="button" size="sm" onClick={() => void createRecord()} disabled={creatingRecord}>
              <Plus size={15} />
              {creatingRecord ? "Creating" : "New"}
            </Button>
          </div>
        </div>
      )}

      <div
        className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
        data-database-table-scroll="true"
      >
        <table className="w-max min-w-[max(100%,620px)] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th
                className="w-10 border-b border-border px-2 py-2 text-center"
                data-database-selection-column="true"
              >
                <SelectionCheckbox
                  ariaLabel="Select all records"
                  checked={allVisibleRecordsSelected}
                  mixed={someVisibleRecordsSelected}
                  disabled={visibleRecordPaths.length === 0 || selectionAction !== null}
                  onChange={toggleAllVisibleRecords}
                />
              </th>
              <SortableHeader label="Name" property="title" sorts={sorts} onSort={toggleSort} />
              {columns.map((column) => (
                <SortableHeader
                  key={column}
                  label={column}
                  property={column}
                  definition={result?.schema.properties[column]}
                  sorts={sorts}
                  onSort={toggleSort}
                  onRename={(newName) => renameProperty(column, newName)}
                  onChangeType={(type) => changePropertyType(column, type)}
                  onDelete={() => deleteProperty(column)}
                />
              ))}
              <th className="w-12 border-b border-border px-2 py-2">
                <button
                  type="button"
                  className="grid h-6 w-7 place-items-center rounded hover:bg-background"
                  aria-label="Add property"
                  title="Add property"
                  onClick={() => setAddingProperty((current) => !current)}
                >
                  <Plus size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedRecords.map((record) => (
              <tr
                key={record.path}
                className={cn(
                  "group hover:bg-muted/30 last:[&>td]:border-b-0",
                  selectedRecordPaths.has(record.path) && "bg-muted/55"
                )}
                data-database-record-selected={selectedRecordPaths.has(record.path) ? "true" : undefined}
              >
                <td className="w-10 border-b border-border px-2 py-1.5 text-center">
                  <SelectionCheckbox
                    ariaLabel={`Select ${record.title}`}
                    checked={selectedRecordPaths.has(record.path)}
                    disabled={selectionAction !== null}
                    onChange={() => toggleRecordSelection(record.path)}
                  />
                </td>
                <td className="border-b border-border px-3 py-1.5 font-medium">
                  <button
                    type="button"
                    className="max-w-[18rem] truncate text-left hover:underline"
                    onClick={() => onOpenRecord(record.path)}
                  >
                    {record.title}
                  </button>
                </td>
                {columns.map((column) => (
                  <td key={column} className="border-b border-border px-2 py-1">
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
                <td className="border-b border-border" />
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && result?.records.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {search ? "No records match this filter." : "No records yet. Create the first one."}
          </div>
        )}
        {loading && !result && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading records…</div>
        )}
      </div>

      {!loading && hasMoreRecords && (
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

      {addingProperty && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/35 p-2">
          <Input
            value={newPropertyName}
            className="h-8 max-w-xs"
            placeholder="Property name"
            autoFocus
            onChange={(event) => setNewPropertyName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addProperty();
              }
            }}
          />
          <select
            value={newPropertyType}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            onChange={(event) => setNewPropertyType(event.target.value as DatabasePropertyType)}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="checkbox">Checkbox</option>
            <option value="select">Select</option>
            <option value="multi-select">Multi-select</option>
          </select>
          <Button type="button" size="sm" onClick={() => void addProperty()} disabled={!newPropertyName.trim()}>
            Add property
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAddingProperty(false)}>
            Cancel
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
      className="h-4 w-4 cursor-pointer accent-sky-600 disabled:cursor-default"
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
  definition,
  sorts,
  onSort,
  onRename,
  onChangeType,
  onDelete
}: {
  label: string;
  property: string;
  definition?: DatabasePropertyDefinition | undefined;
  sorts: DatabaseSort[];
  onSort: (property: string) => void;
  onRename?: ((newName: string) => Promise<boolean>) | undefined;
  onChangeType?: ((type: DatabasePropertyType) => Promise<boolean>) | undefined;
  onDelete?: (() => Promise<boolean>) | undefined;
}): ReactElement {
  const direction = sorts.find((sort) => sort.property === property)?.direction;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(label);
  const [busy, setBusy] = useState(false);
  const manageable = Boolean(definition && onRename && onChangeType && onDelete);

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
      className="border-b border-r border-border px-2 py-1.5 last:border-r-0"
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
            <span className="truncate">{label}</span>
            {direction === "asc" ? <CaretUp size={12} /> : direction === "desc" ? <CaretDown size={12} /> : null}
          </button>
        )}
        {definition && onRename && onChangeType && onDelete && (
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => void onDelete()}
              >
                <Trash size={16} aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </th>
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

function parseInput(event: ChangeEvent<HTMLInputElement> | { target: HTMLInputElement }, type: DatabasePropertyType): unknown {
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

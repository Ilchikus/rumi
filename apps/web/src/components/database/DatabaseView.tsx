import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import type { RumiApiClient } from "@rumi/api-client";
import type {
  DatabasePropertyDefinition,
  DatabasePropertyType,
  DatabaseRecord,
  DatabaseSort,
  QueryDatabaseResult
} from "@rumi/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

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

  const updateProperty = useCallback(
    async (record: DatabaseRecord, property: string, value: unknown) => {
      const previousResult = result;

      if (!previousResult) {
        return;
      }

      setResult({
        ...previousResult,
        records: previousResult.records.map((candidate) =>
          candidate.path === record.path
            ? { ...candidate, frontmatter: { ...candidate.frontmatter, [property]: value } }
            : candidate
        )
      });

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
        setResult(previousResult);
        onMessage(errorMessage(error));
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

    const definition: DatabasePropertyDefinition =
      newPropertyType === "select" || newPropertyType === "multi-select"
        ? { type: newPropertyType, options: [] }
        : { type: newPropertyType };
    const properties = { ...result.schema.properties, [propertyName]: definition };
    const views = result.schema.views.map((view, index) =>
      index === 0 ? { ...view, columns: [...view.columns, propertyName] } : view
    );

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
    async (property: string) => {
      if (!result) {
        return;
      }

      const newName = window.prompt(`Rename “${property}” to`, property)?.trim();

      if (!newName || newName === property) {
        return;
      }

      try {
        const saved = await api.renameDatabaseProperty({
          databasePath,
          baseVersion: result.schemaVersion,
          property,
          newName
        });

        if (saved.status === "conflict") {
          onMessage("The database schema changed elsewhere. Reloaded the latest version.");
        }

        await load();
      } catch (error) {
        onMessage(errorMessage(error));
      }
    },
    [api, databasePath, load, onMessage, result]
  );

  const toggleSort = useCallback((property: string) => {
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
    <section className="mt-8 border-y border-border py-5" aria-label="Database records">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          className="h-8 max-w-xs"
          placeholder="Filter records"
          aria-label="Filter records"
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
            <ArrowsClockwise size={15} />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => void createRecord()} disabled={creatingRecord}>
            <Plus size={15} />
            {creatingRecord ? "Creating" : "New"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead className="bg-muted/70 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <SortableHeader label="Name" property="title" sorts={sorts} onSort={toggleSort} />
              {columns.map((column) => (
                <SortableHeader
                  key={column}
                  label={column}
                  property={column}
                  sorts={sorts}
                  onSort={toggleSort}
                  onRename={() => void renameProperty(column)}
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
            {result?.records.map((record) => (
              <tr key={record.path} className="group hover:bg-muted/30">
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
                      definition={result.schema.properties[column] ?? { type: "text" }}
                      value={record.frontmatter[column]}
                      onChange={(value) => void updateProperty(record, column, value)}
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
    </section>
  );
}

function SortableHeader({
  label,
  property,
  sorts,
  onSort,
  onRename
}: {
  label: string;
  property: string;
  sorts: DatabaseSort[];
  onSort: (property: string) => void;
  onRename?: () => void;
}): ReactElement {
  const direction = sorts.find((sort) => sort.property === property)?.direction;

  return (
    <th className="border-b border-r border-border px-2 py-1.5 last:border-r-0">
      <div className="flex items-center gap-0.5">
      <button
        type="button"
        className="flex min-h-6 w-full items-center gap-1 rounded px-1 text-left hover:bg-background"
        onClick={() => onSort(property)}
      >
        <span className="truncate">{label}</span>
        {direction === "asc" ? <CaretUp size={12} /> : direction === "desc" ? <CaretDown size={12} /> : null}
      </button>
      {onRename && (
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-background"
          aria-label={`Rename ${label} property`}
          title="Rename property"
          onClick={onRename}
        >
          <DotsThree size={14} />
        </button>
      )}
      </div>
    </th>
  );
}

function PropertyCell({
  definition,
  value,
  onChange
}: {
  definition: DatabasePropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}): ReactElement {
  if (definition.type === "checkbox") {
    return (
      <label className="grid h-7 w-8 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={value === true}
          className="h-4 w-4 accent-black"
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  if (definition.type === "select") {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        className="h-7 min-w-28 rounded border-0 bg-transparent px-1 outline-none focus:ring-1 focus:ring-ring"
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">Empty</option>
        {(definition.options ?? []).map((option) => (
          <option key={option.name} value={option.name}>
            {option.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={definition.type === "number" ? "number" : definition.type === "date" ? "date" : "text"}
      defaultValue={inputValue(value, definition.type)}
      key={`${definition.type}:${inputValue(value, definition.type)}`}
      className={cn(
        "h-7 w-full min-w-28 rounded border-0 bg-transparent px-1 outline-none focus:bg-background focus:ring-1 focus:ring-ring",
        definition.type === "multi-select" && "min-w-40"
      )}
      placeholder={definition.type === "multi-select" ? "Comma-separated" : "Empty"}
      onBlur={(event) => onChange(parseInput(event, definition.type))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
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

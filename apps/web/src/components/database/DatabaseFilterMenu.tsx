import { Funnel } from "@phosphor-icons/react/dist/csr/Funnel";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type {
  DatabaseFilterGroup,
  DatabaseFilterItem,
  DatabaseFilterRule,
  DatabasePropertyDefinition,
  DatabasePropertyOption
} from "@rumi/contracts";
import { cn } from "../../lib/utils";
import {
  DatabaseOptionPill,
  optionForValue
} from "../editor/DatabaseOptionPill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

type FilterMode = "and" | "or";
type PropertyCatalog = Record<string, DatabasePropertyDefinition>;

const EMPTY_OPERATORS = new Set<DatabaseFilterRule["operator"]>([
  "is-empty",
  "is-not-empty"
]);

const OPERATOR_LABELS: Record<DatabaseFilterRule["operator"], string> = {
  contains: "Contains",
  "not-contains": "Does not contain",
  equals: "Equals",
  "not-equals": "Does not equal",
  "is-empty": "Is empty",
  "is-not-empty": "Is not empty",
  "greater-than": "Greater than",
  "less-than": "Less than"
};

export function databaseFilterOperators(
  definition: DatabasePropertyDefinition
): DatabaseFilterRule["operator"][] {
  switch (definition.type) {
    case "text":
      return ["contains", "not-contains", "equals", "not-equals", "is-empty", "is-not-empty"];
    case "number":
    case "date":
      return ["equals", "not-equals", "greater-than", "less-than", "is-empty", "is-not-empty"];
    case "checkbox":
      return ["equals", "not-equals"];
    case "select":
    case "multi-select":
      return ["contains", "not-contains", "equals", "not-equals", "is-empty", "is-not-empty"];
  }
}

export function databaseFilterRuleComplete(
  rule: DatabaseFilterRule,
  properties: PropertyCatalog
): boolean {
  const definition = rule.property === "title" ? { type: "text" as const } : properties[rule.property];
  if (!definition || !databaseFilterOperators(definition).includes(rule.operator)) return false;
  if (EMPTY_OPERATORS.has(rule.operator)) return true;
  if (rule.value === undefined || rule.value === "") return false;
  if (definition.type === "number") return typeof rule.value === "number";
  if (definition.type === "date") {
    return typeof rule.value === "string" && isIsoDate(rule.value);
  }
  if (definition.type === "checkbox") return typeof rule.value === "boolean";
  if (definition.type === "select" || definition.type === "multi-select") {
    const values = Array.isArray(rule.value) ? rule.value : [rule.value];
    const equality = rule.operator === "equals" || rule.operator === "not-equals";
    if (
      (definition.type === "select" && Array.isArray(rule.value))
      || (definition.type === "multi-select" && equality && !Array.isArray(rule.value))
      || (definition.type === "multi-select" && !equality && Array.isArray(rule.value))
    ) {
      return false;
    }
    const options = new Set(
      (definition.options ?? []).map((option) => option.name.toLocaleLowerCase())
    );
    return values.length > 0 && values.every(
      (value) => typeof value === "string" && options.has(value.toLocaleLowerCase())
    );
  }
  return typeof rule.value === "string" && rule.value.length > 0;
}

export function databaseFilterTreeComplete(
  filters: readonly DatabaseFilterItem[],
  properties: PropertyCatalog
): boolean {
  return filters.every((filter) => (
    isFilterGroup(filter)
      ? filter.filters.length > 0 && databaseFilterTreeComplete(filter.filters, properties)
      : databaseFilterRuleComplete(filter, properties)
  ));
}

export function databaseFilterRuleCount(filters: readonly DatabaseFilterItem[]): number {
  return filters.reduce(
    (count, filter) => count + (isFilterGroup(filter)
      ? databaseFilterRuleCount(filter.filters)
      : 1),
    0
  );
}

export function databaseFilterRuleForProperty(
  property: string,
  properties: PropertyCatalog
): DatabaseFilterRule {
  const definition = property === "title"
    ? { type: "text" as const }
    : properties[property] ?? { type: "text" as const };
  return {
    property,
    operator: databaseFilterOperators(definition)[0] ?? "equals"
  };
}

export function databaseFilterOptionsForQuery(
  options: readonly DatabasePropertyOption[],
  query: string
): DatabasePropertyOption[] {
  const normalized = query.toLocaleLowerCase();
  return options.filter((option) => option.name.toLocaleLowerCase().includes(normalized));
}

export interface DatabaseFilterMenuProps {
  properties: PropertyCatalog;
  filters: readonly DatabaseFilterItem[];
  filterMode?: FilterMode;
  disabled?: boolean;
  onChange: (filters: DatabaseFilterItem[], filterMode: FilterMode) => Promise<boolean>;
}

export function DatabaseFilterMenu({
  properties,
  filters,
  filterMode = "and",
  disabled = false,
  onChange
}: DatabaseFilterMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DatabaseFilterItem[]>(() => cloneFilters(filters));
  const [draftMode, setDraftMode] = useState<FilterMode>(filterMode);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const count = databaseFilterRuleCount(filters);

  useEffect(() => {
    if (open) return;
    setDraft(cloneFilters(filters));
    setDraftMode(filterMode);
    setSaveError("");
  }, [filterMode, filters, open]);

  const persist = async () => {
    if (!databaseFilterTreeComplete(draft, properties) || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const saved = await onChange(draft, draftMode);
      if (saved) setOpen(false);
      else setSaveError("Filters could not be applied.");
    } catch {
      setSaveError("Filters could not be applied.");
    } finally {
      setSaving(false);
    }
  };

  const update = (
    nextFilters: DatabaseFilterItem[],
    nextMode: FilterMode = draftMode
  ) => {
    setDraft(nextFilters);
    setDraftMode(nextMode);
    setSaveError("");
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            count > 0 && "text-foreground"
          )}
          aria-label="Filter database"
          title="Filter"
          disabled={disabled}
        >
          <Funnel size={16} weight={count > 0 ? "fill" : "regular"} />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-foreground px-1 text-center text-[9px] leading-4 text-background">
              {count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[min(34rem,calc(100vh-5rem))] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto p-2"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-xs font-semibold">Show records matching</span>
          <LogicSelect
            value={draftMode}
            disabled={disabled || saving}
            onChange={(mode) => update(draft, mode)}
          />
        </div>
        <FilterGroupEditor
          filters={draft}
          properties={properties}
          disabled={disabled || saving}
          root
          onChange={(next) => update(next, draftMode)}
        />
        <div className="mt-3 flex items-center justify-end gap-3 border-t border-border pt-2">
          {saveError && (
            <p className="mr-auto text-xs text-destructive" role="alert">{saveError}</p>
          )}
          <button
            type="button"
            className="h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-default disabled:opacity-50"
            disabled={
              disabled
              || saving
              || !databaseFilterTreeComplete(draft, properties)
            }
            onClick={() => void persist()}
          >
            {saving ? "Applying…" : "Apply"}
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterGroupEditor({
  filters,
  properties,
  disabled,
  root = false,
  mode = "and",
  onModeChange,
  onChange,
  onRemove
}: {
  filters: DatabaseFilterItem[];
  properties: PropertyCatalog;
  disabled: boolean;
  root?: boolean;
  mode?: FilterMode;
  onModeChange?: (mode: FilterMode) => void;
  onChange: (filters: DatabaseFilterItem[]) => void;
  onRemove?: () => void;
}): ReactElement {
  const addRule = () => {
    onChange([
      ...filters,
      { property: "title", operator: "contains" }
    ]);
  };
  const addGroup = () => {
    onChange([
      ...filters,
      {
        filterMode: "and",
        filters: [{ property: "title", operator: "contains" }]
      }
    ]);
  };

  return (
    <div className={cn(!root && "rounded-md border border-border bg-muted/25 p-2")}>
      {!root && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Group matches</span>
          <LogicSelect value={mode} disabled={disabled} onChange={onModeChange ?? (() => undefined)} />
          <button
            type="button"
            className="ml-auto grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-background hover:text-destructive"
            aria-label="Remove filter group"
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash size={14} />
          </button>
        </div>
      )}
      <div className="space-y-2">
        {filters.map((filter, index) => (
          isFilterGroup(filter) ? (
            <FilterGroupEditor
              key={`group-${index}`}
              filters={filter.filters}
              properties={properties}
              disabled={disabled}
              mode={filter.filterMode ?? "and"}
              onModeChange={(nextMode) => {
                const next = [...filters];
                next[index] = { ...filter, filterMode: nextMode };
                onChange(next);
              }}
              onChange={(nested) => {
                const next = [...filters];
                next[index] = { ...filter, filters: nested };
                onChange(next);
              }}
              onRemove={() => onChange(filters.filter((_, candidate) => candidate !== index))}
            />
          ) : (
            <FilterRuleEditor
              key={`rule-${index}`}
              rule={filter}
              properties={properties}
              disabled={disabled}
              onChange={(rule) => {
                const next = [...filters];
                next[index] = rule;
                onChange(next);
              }}
              onRemove={() => onChange(filters.filter((_, candidate) => candidate !== index))}
            />
          )
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
          disabled={disabled}
          onClick={addRule}
        >
          <Plus size={13} />
          Rule
        </button>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
          disabled={disabled}
          onClick={addGroup}
        >
          <Plus size={13} />
          Group
        </button>
      </div>
    </div>
  );
}

function FilterRuleEditor({
  rule,
  properties,
  disabled,
  onChange,
  onRemove
}: {
  rule: DatabaseFilterRule;
  properties: PropertyCatalog;
  disabled: boolean;
  onChange: (rule: DatabaseFilterRule) => void;
  onRemove: () => void;
}): ReactElement {
  const definition = rule.property === "title"
    ? { type: "text" as const }
    : properties[rule.property] ?? { type: "text" as const };
  const operators = databaseFilterOperators(definition);

  return (
    <div className="grid grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1.25fr)_2rem] gap-1.5">
      <select
        value={rule.property}
        className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        disabled={disabled}
        aria-label="Filter property"
        onChange={(event) => {
          onChange(databaseFilterRuleForProperty(event.currentTarget.value, properties));
        }}
      >
        <option value="title">Name</option>
        {Object.keys(properties).map((property) => (
          <option key={property} value={property}>{property}</option>
        ))}
      </select>
      <select
        value={rule.operator}
        className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        disabled={disabled}
        aria-label="Filter condition"
        onChange={(event) => {
          const operator = event.currentTarget.value as DatabaseFilterRule["operator"];
          onChange({
            property: rule.property,
            operator,
            ...(!EMPTY_OPERATORS.has(operator) && rule.value !== undefined
              ? { value: rule.value }
              : {})
          });
        }}
      >
        {operators.map((operator) => (
          <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>
        ))}
      </select>
      <FilterValueEditor
        rule={rule}
        definition={definition}
        disabled={disabled || EMPTY_OPERATORS.has(rule.operator)}
        onChange={(value) => onChange({ ...rule, value })}
      />
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
        aria-label="Remove filter rule"
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash size={14} />
      </button>
    </div>
  );
}

function FilterValueEditor({
  rule,
  definition,
  disabled,
  onChange
}: {
  rule: DatabaseFilterRule;
  definition: DatabasePropertyDefinition;
  disabled: boolean;
  onChange: (value: unknown) => void;
}): ReactElement {
  if (EMPTY_OPERATORS.has(rule.operator)) {
    return (
      <div className="flex h-8 items-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground">
        No value
      </div>
    );
  }
  if (definition.type === "checkbox") {
    return (
      <select
        value={rule.value === undefined ? "" : rule.value === false ? "false" : "true"}
        className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        disabled={disabled}
        aria-label="Filter value"
        onChange={(event) => onChange(event.currentTarget.value === "true")}
      >
        <option value="" disabled>Choose value…</option>
        <option value="true">Checked</option>
        <option value="false">Unchecked</option>
      </select>
    );
  }
  if (definition.type === "select" || definition.type === "multi-select") {
    const multiple = definition.type === "multi-select"
      && (rule.operator === "equals" || rule.operator === "not-equals");
    return (
      <DatabaseFilterOptionPicker
        options={definition.options ?? []}
        value={multiple
          ? Array.isArray(rule.value) ? rule.value.filter((item): item is string => typeof item === "string") : []
          : typeof rule.value === "string" ? [rule.value] : []
        }
        multiple={multiple}
        disabled={disabled}
        onChange={(value) => onChange(multiple ? value : value[0])}
      />
    );
  }

  return (
    <input
      type={definition.type === "number" ? "number" : definition.type === "date" ? "date" : "text"}
      value={typeof rule.value === "string" || typeof rule.value === "number" ? rule.value : ""}
      className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
      disabled={disabled}
      aria-label="Filter value"
      onChange={(event) => {
        const value = definition.type === "number"
          ? event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value)
          : event.currentTarget.value;
        onChange(value);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
        }
      }}
    />
  );
}

function DatabaseFilterOptionPicker({
  options,
  value,
  multiple,
  disabled,
  onChange
}: {
  options: readonly DatabasePropertyOption[];
  value: string[];
  multiple: boolean;
  disabled: boolean;
  onChange: (value: string[]) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => databaseFilterOptionsForQuery(options, query),
    [options, query]
  );

  return (
    <DropdownMenuSub
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <DropdownMenuSubTrigger
        className="h-8 min-w-0 truncate rounded-md border border-input bg-background px-2 text-left text-xs"
        disabled={disabled}
        aria-label="Filter option value"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {value.length > 0 ? (
            value.map((item) => (
              <DatabaseOptionPill
                key={item}
                option={optionForValue(item, options)}
                className="shrink-0"
              />
            ))
          ) : (
            <span className="truncate text-muted-foreground">Choose option…</span>
          )}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56 p-1">
        <input
          value={query}
          autoFocus
          placeholder="Search options"
          aria-label="Search filter options"
          className="mb-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") event.stopPropagation();
          }}
        />
        <div className="max-h-48 overflow-y-auto">
          {filtered.map((option) => {
            const selected = value.includes(option.name);
            return (
              <button
                key={option.name}
                type="button"
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent",
                  selected && "bg-muted"
                )}
                onClick={() => {
                  const next = multiple
                    ? selected
                      ? value.filter((item) => item !== option.name)
                      : [...value, option.name]
                    : [option.name];
                  onChange(next);
                  if (!multiple) setOpen(false);
                }}
              >
                <span className="w-4 text-center" aria-hidden="true">{selected ? "✓" : ""}</span>
                <DatabaseOptionPill option={option} className="min-w-0" />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">No matching options</p>
          )}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function LogicSelect({
  value,
  disabled,
  onChange
}: {
  value: FilterMode;
  disabled: boolean;
  onChange: (mode: FilterMode) => void;
}): ReactElement {
  return (
    <select
      value={value}
      disabled={disabled}
      className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium uppercase outline-none focus:ring-2 focus:ring-ring"
      aria-label="Filter logic"
      onChange={(event) => onChange(event.currentTarget.value as FilterMode)}
    >
      <option value="and">And</option>
      <option value="or">Or</option>
    </select>
  );
}

function isFilterGroup(filter: DatabaseFilterItem): filter is DatabaseFilterGroup {
  return "filters" in filter;
}

function cloneFilters(filters: readonly DatabaseFilterItem[]): DatabaseFilterItem[] {
  return filters.map((filter) => (
    isFilterGroup(filter)
      ? { ...filter, filters: cloneFilters(filter.filters) }
      : { ...filter }
  ));
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

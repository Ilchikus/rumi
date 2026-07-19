import type { FrontmatterRecord } from "@rumi/contracts";
import { CheckSquare } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Square } from "@phosphor-icons/react/dist/csr/Square";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../ui/button";
import { formatPropertyValue } from "./pagePresentation";

export type PagePropertyKind = "text" | "number" | "date" | "checkbox" | "list" | "json";

export interface PagePropertiesProps {
  frontmatter: FrontmatterRecord;
  disabled?: boolean;
  onChange?: (frontmatter: FrontmatterRecord) => void;
}

const PROPERTY_KIND_OPTIONS: ReadonlyArray<{ value: PagePropertyKind; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "list", label: "List" },
  { value: "json", label: "JSON" }
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function pagePropertyKind(value: unknown): PagePropertyKind {
  if (typeof value === "boolean") {
    return "checkbox";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (Array.isArray(value)) {
    return "list";
  }

  if (value !== null && typeof value === "object") {
    return "json";
  }

  if (typeof value === "string" && isIsoDate(value)) {
    return "date";
  }

  return "text";
}

export function createPagePropertyValue(kind: PagePropertyKind, today = currentIsoDate()): unknown {
  switch (kind) {
    case "text":
      return "";
    case "number":
      return 0;
    case "date":
      return today;
    case "checkbox":
      return false;
    case "list":
      return [];
    case "json":
      return {};
  }
}

export function convertPagePropertyValue(
  value: unknown,
  kind: PagePropertyKind,
  today = currentIsoDate()
): unknown {
  switch (kind) {
    case "text":
      if (value === null || value === undefined) return "";
      if (typeof value === "string") return value;
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const converted = typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
      return Number.isFinite(converted) ? converted : 0;
    }
    case "date":
      return typeof value === "string" && isIsoDate(value) ? value : today;
    case "checkbox":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return ["true", "yes", "1"].includes(value.trim().toLocaleLowerCase());
      return Boolean(value);
    case "list":
      if (Array.isArray(value)) return value;
      if (value === null || value === undefined || value === "") return [];
      return [value];
    case "json":
      if (value !== null && typeof value === "object") return value;
      if (typeof value === "string") {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return {};
        }
      }
      return {};
  }
}

export function renameFrontmatterProperty(
  frontmatter: FrontmatterRecord,
  previousName: string,
  nextName: string
): FrontmatterRecord {
  const normalizedName = nextName.trim();

  if (
    !normalizedName ||
    normalizedName === previousName ||
    Object.prototype.hasOwnProperty.call(frontmatter, normalizedName)
  ) {
    return frontmatter;
  }

  const renamed: FrontmatterRecord = {};

  for (const [name, value] of Object.entries(frontmatter)) {
    renamed[name === previousName ? normalizedName : name] = value;
  }

  return renamed;
}

export function PageProperties({ frontmatter, disabled = false, onChange }: PagePropertiesProps): ReactElement | null {
  const properties = Object.entries(frontmatter);
  const editable = Boolean(onChange);
  const [addingProperty, setAddingProperty] = useState(false);

  if (!editable && properties.length === 0) {
    return null;
  }

  const updateProperty = (name: string, value: unknown) => {
    onChange?.({ ...frontmatter, [name]: value });
  };

  const deleteProperty = (name: string) => {
    if (!onChange) return;
    const nextFrontmatter = { ...frontmatter };
    delete nextFrontmatter[name];
    onChange(nextFrontmatter);
  };

  const renameProperty = (previousName: string, nextName: string) => {
    const nextFrontmatter = renameFrontmatterProperty(frontmatter, previousName, nextName);
    if (nextFrontmatter !== frontmatter) {
      onChange?.(nextFrontmatter);
    }
  };

  return (
    <section className="mt-8" aria-labelledby="page-properties-heading">
      <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
        <h2
          id="page-properties-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Properties
        </h2>
        {editable && !addingProperty && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground"
            disabled={disabled}
            onClick={() => setAddingProperty(true)}
          >
            <Plus size={13} aria-hidden="true" />
            Add property
          </Button>
        )}
      </div>

      {properties.length > 0 && (
        <dl className="space-y-1">
          {properties.map(([name, value]) => (
            <PropertyRow
              key={name}
              name={name}
              value={value}
              allNames={properties.map(([propertyName]) => propertyName)}
              disabled={disabled}
              editable={editable}
              onDelete={() => deleteProperty(name)}
              onRename={(nextName) => renameProperty(name, nextName)}
              onChange={(nextValue) => updateProperty(name, nextValue)}
            />
          ))}
        </dl>
      )}

      {editable && addingProperty && (
        <AddPropertyRow
          existingNames={properties.map(([name]) => name)}
          disabled={disabled}
          onCancel={() => setAddingProperty(false)}
          onAdd={(name, kind) => {
            onChange?.({ ...frontmatter, [name]: createPagePropertyValue(kind) });
            setAddingProperty(false);
          }}
        />
      )}
    </section>
  );
}

interface PropertyRowProps {
  name: string;
  value: unknown;
  allNames: string[];
  disabled: boolean;
  editable: boolean;
  onChange: (value: unknown) => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

function PropertyRow({
  name,
  value,
  allNames,
  disabled,
  editable,
  onChange,
  onDelete,
  onRename
}: PropertyRowProps): ReactElement {
  const kind = pagePropertyKind(value);

  if (!editable) {
    return (
      <div className="grid min-h-8 grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/70">
        <dt className="truncate text-muted-foreground" title={name}>
          {name}
        </dt>
        <dd className="min-w-0 break-words text-foreground">
          <PropertyValue value={value} />
        </dd>
      </div>
    );
  }

  return (
    <div className="group grid min-h-9 grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)_5.75rem_2rem] items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/70 focus-within:bg-muted/70">
      <dt className="min-w-0">
        <PropertyNameInput
          name={name}
          allNames={allNames}
          disabled={disabled}
          onRename={onRename}
        />
      </dt>
      <dd className="min-w-0">
        <PropertyValueEditor kind={kind} value={value} disabled={disabled} onChange={onChange} />
      </dd>
      <select
        aria-label={`Type for ${name}`}
        className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-xs text-muted-foreground outline-none hover:border-input focus:border-input focus:ring-2 focus:ring-ring disabled:opacity-50"
        value={kind}
        disabled={disabled}
        onChange={(event) =>
          onChange(convertPagePropertyValue(value, event.currentTarget.value as PagePropertyKind))
        }
      >
        {PROPERTY_KIND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        disabled={disabled}
        onClick={onDelete}
      >
        <Trash size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}

interface PropertyNameInputProps {
  name: string;
  allNames: string[];
  disabled: boolean;
  onRename: (name: string) => void;
}

function PropertyNameInput({ name, allNames, disabled, onRename }: PropertyNameInputProps): ReactElement {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const cancelledRef = useRef(false);

  useEffect(() => {
    setDraft(name);
    setError("");
  }, [name]);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(name);
      setError("");
      return;
    }

    const nextName = draft.trim();
    if (!nextName) {
      setDraft(name);
      setError("A property name cannot be empty.");
      return;
    }

    if (nextName !== name && allNames.includes(nextName)) {
      setDraft(name);
      setError(`“${nextName}” already exists.`);
      return;
    }

    setError("");
    onRename(nextName);
  };

  return (
    <input
      aria-label={`Property name: ${name}`}
      aria-invalid={error ? true : undefined}
      title={error || name}
      className="h-7 w-full truncate rounded border border-transparent bg-transparent px-1 text-xs text-muted-foreground outline-none hover:border-input focus:border-input focus:ring-2 focus:ring-ring disabled:opacity-50"
      value={draft}
      disabled={disabled}
      onFocus={() => {
        cancelledRef.current = false;
        setError("");
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelledRef.current = true;
          setDraft(name);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface PropertyValueEditorProps {
  kind: PagePropertyKind;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}

function PropertyValueEditor({ kind, value, disabled, onChange }: PropertyValueEditorProps): ReactElement {
  switch (kind) {
    case "checkbox": {
      const checked = value === true;
      const Icon = checked ? CheckSquare : Square;
      return (
        <button
          type="button"
          aria-pressed={checked}
          className="flex h-7 w-full items-center gap-1.5 rounded px-1 text-left outline-none hover:bg-background focus:ring-2 focus:ring-ring disabled:opacity-50"
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          <Icon size={16} className="text-neutral-400" aria-hidden="true" />
          {checked ? "True" : "False"}
        </button>
      );
    }
    case "number":
      return (
        <DraftInput
          ariaLabel="Property number"
          value={typeof value === "number" ? String(value) : ""}
          disabled={disabled}
          inputMode="decimal"
          parse={(draft) => {
            if (draft.trim() === "") return { ok: true, value: null };
            const number = Number(draft);
            return Number.isFinite(number)
              ? { ok: true, value: number }
              : { ok: false, message: "Enter a valid number." };
          }}
          onCommit={onChange}
        />
      );
    case "date":
      return (
        <input
          type="date"
          aria-label="Property date"
          className={propertyInputClassName}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      );
    case "list":
      return (
        <ListEditor
          values={Array.isArray(value) ? value : []}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "json":
      return <JsonEditor value={value} disabled={disabled} onChange={onChange} />;
    case "text":
      return (
        <DraftInput
          ariaLabel="Property text"
          value={typeof value === "string" ? value : value == null ? "" : String(value)}
          disabled={disabled}
          parse={(draft) => ({ ok: true, value: draft })}
          onCommit={onChange}
        />
      );
  }
}

type ParseResult = { ok: true; value: unknown } | { ok: false; message: string };

interface DraftInputProps {
  ariaLabel: string;
  value: string;
  disabled: boolean;
  inputMode?: "decimal";
  parse: (draft: string) => ParseResult;
  onCommit: (value: unknown) => void;
}

function DraftInput({ ariaLabel, value, disabled, inputMode, parse, onCommit }: DraftInputProps): ReactElement {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const cancelledRef = useRef(false);

  useEffect(() => {
    setDraft(value);
    setError("");
  }, [value]);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(value);
      setError("");
      return;
    }

    if (draft === value) {
      setError("");
      return;
    }

    const result = parse(draft);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setError("");
    onCommit(result.value);
  };

  return (
    <input
      aria-label={ariaLabel}
      aria-invalid={error ? true : undefined}
      title={error || undefined}
      className={propertyInputClassName}
      value={draft}
      disabled={disabled}
      inputMode={inputMode}
      onFocus={() => {
        cancelledRef.current = false;
        setError("");
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelledRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface ListEditorProps {
  values: unknown[];
  disabled: boolean;
  onChange: (value: unknown[]) => void;
}

function ListEditor({ values, disabled, onChange }: ListEditorProps): ReactElement {
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    const nextValue = draft.trim();
    if (!nextValue) return;
    onChange([...values, nextValue]);
    setDraft("");
  };

  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1 rounded border border-transparent px-1 hover:border-input focus-within:border-input focus-within:ring-2 focus-within:ring-ring">
      {values.map((item, index) => (
        <span key={index} className="inline-flex max-w-full items-center gap-0.5 rounded bg-background px-1.5 py-0.5 text-xs">
          <span className="truncate">{formatPropertyValue(item)}</span>
          <button
            type="button"
            aria-label={`Remove ${formatPropertyValue(item)}`}
            className="rounded text-muted-foreground hover:text-destructive focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            disabled={disabled}
            onClick={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-label="Add list item"
        className="h-6 min-w-20 flex-1 bg-transparent px-0.5 text-sm outline-none placeholder:text-muted-foreground"
        value={draft}
        disabled={disabled}
        placeholder={values.length === 0 ? "Add an item" : undefined}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={addDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addDraft();
          } else if (event.key === "Escape") {
            setDraft("");
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

interface JsonEditorProps {
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}

function JsonEditor({ value, disabled, onChange }: JsonEditorProps): ReactElement {
  const formattedValue = JSON.stringify(value, null, 2) ?? "null";
  const [draft, setDraft] = useState(formattedValue);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(formattedValue);
    setError("");
  }, [formattedValue]);

  const commit = () => {
    if (draft === formattedValue) {
      setError("");
      return;
    }

    try {
      onChange(JSON.parse(draft) as unknown);
      setError("");
    } catch {
      setError("Enter valid JSON before leaving this field.");
    }
  };

  return (
    <textarea
      aria-label="Property JSON"
      aria-invalid={error ? true : undefined}
      title={error || undefined}
      className="min-h-16 w-full resize-y rounded border border-input bg-background px-2 py-1 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(formattedValue);
          setError("");
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface AddPropertyRowProps {
  existingNames: string[];
  disabled: boolean;
  onAdd: (name: string, kind: PagePropertyKind) => void;
  onCancel: () => void;
}

function AddPropertyRow({ existingNames, disabled, onAdd, onCancel }: AddPropertyRowProps): ReactElement {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PagePropertyKind>("text");
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Enter a property name.");
      return;
    }

    if (existingNames.includes(normalizedName)) {
      setError(`“${normalizedName}” already exists.`);
      return;
    }

    onAdd(normalizedName, kind);
  };

  return (
    <div className="mt-1 grid grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-dashed border-border px-2 py-1.5">
      <div>
        <input
          ref={nameRef}
          aria-label="New property name"
          aria-invalid={error ? true : undefined}
          className={propertyInputClassName}
          value={name}
          disabled={disabled}
          placeholder="Property name"
          onChange={(event) => {
            setName(event.currentTarget.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              onCancel();
            }
          }}
        />
        {error && <p className="mt-1 px-1 text-xs text-destructive">{error}</p>}
      </div>
      <select
        aria-label="New property type"
        className="h-7 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        value={kind}
        disabled={disabled}
        onChange={(event) => setKind(event.currentTarget.value as PagePropertyKind)}
      >
        {PROPERTY_KIND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={disabled} onClick={submit}>
          Add
        </Button>
      </div>
    </div>
  );
}

function PropertyValue({ value }: { value: unknown }): ReactElement {
  if (typeof value === "boolean") {
    const Icon = value ? CheckSquare : Square;

    return (
      <span className="inline-flex items-center gap-1.5">
        <Icon size={16} className="text-neutral-400" aria-hidden="true" />
        {value ? "True" : "False"}
      </span>
    );
  }

  if (Array.isArray(value) && value.length > 0) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {value.map((item, index) => (
          <span key={index} className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {formatPropertyValue(item)}
          </span>
        ))}
      </span>
    );
  }

  const displayValue = formatPropertyValue(value);

  return (
    <span className={displayValue === "Empty" ? "text-muted-foreground" : undefined}>
      {displayValue}
    </span>
  );
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function currentIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const propertyInputClassName =
  "h-7 w-full rounded border border-transparent bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground hover:border-input focus:border-input focus:ring-2 focus:ring-ring disabled:opacity-50";

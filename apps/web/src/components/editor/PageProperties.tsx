import type {
  DatabasePropertyDefinition,
  DatabasePropertyOption,
  DatabasePropertyOptionColor,
  DatabasePropertyType,
  FrontmatterRecord,
  PageDatabaseContext
} from "@rumi/contracts";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { CheckSquare } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { Eye } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlash } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Square } from "@phosphor-icons/react/dist/csr/Square";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../ui/button";
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
import { DatabaseOptionEditor } from "./DatabaseOptionEditor";
import { DatabaseOptionPill, optionForValue } from "./DatabaseOptionPill";
import { formatPropertyValue } from "./pagePresentation";
import { PropertyCreateMenu } from "./PropertyCreateMenu";

export type PagePropertyKind = "text" | "number" | "date" | "checkbox" | "list" | "json";
type PropertyEditorKind = PagePropertyKind | "select" | "multi-select";

export interface PagePropertiesProps {
  frontmatter: FrontmatterRecord;
  database?: PageDatabaseContext | undefined;
  disabled?: boolean;
  onChange?: (frontmatter: FrontmatterRecord) => void;
  onCreateDatabaseOption?: (property: string, option: string) => Promise<boolean>;
  onChangeDatabaseOptionColor?: (
    property: string,
    option: string,
    color: DatabasePropertyOptionColor
  ) => Promise<boolean>;
  onRenameDatabaseOption?: (
    property: string,
    option: string,
    newName: string
  ) => Promise<boolean>;
  onDeleteDatabaseOption?: (property: string, option: string) => Promise<boolean>;
  onCreateDatabaseProperty?: (
    property: string,
    type: DatabasePropertyType
  ) => Promise<boolean>;
  onRenameDatabaseProperty?: (property: string, newName: string) => Promise<boolean>;
  onChangeDatabasePropertyType?: (
    property: string,
    type: DatabasePropertyType
  ) => Promise<boolean>;
  onDeleteDatabaseProperty?: (property: string) => Promise<boolean>;
  onSetDatabasePropertyVisibility?: (
    property: string,
    visible: boolean
  ) => Promise<boolean>;
}

const PROPERTY_KIND_OPTIONS: ReadonlyArray<{ value: PagePropertyKind; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "list", label: "List" },
  { value: "json", label: "JSON" }
];

const DATABASE_PROPERTY_KIND_OPTIONS: ReadonlyArray<{
  value: DatabasePropertyType;
  label: string;
}> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Select" },
  { value: "multi-select", label: "Multi-select" }
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

export function PageProperties({
  frontmatter,
  database,
  disabled = false,
  onChange,
  onCreateDatabaseOption,
  onChangeDatabaseOptionColor,
  onRenameDatabaseOption,
  onDeleteDatabaseOption,
  onCreateDatabaseProperty,
  onRenameDatabaseProperty,
  onChangeDatabasePropertyType,
  onDeleteDatabaseProperty,
  onSetDatabasePropertyVisibility
}: PagePropertiesProps): ReactElement | null {
  const schemaPropertyNames = database ? Object.keys(database.schema.properties) : [];
  const hiddenSchemaProperties = new Set(database?.schema.recordPage.hiddenProperties ?? []);
  const visibleSchemaPropertyNames = schemaPropertyNames.filter(
    (name) => !hiddenSchemaProperties.has(name)
  );
  const propertyNames = [
    ...visibleSchemaPropertyNames,
    ...Object.keys(frontmatter).filter((name) => !schemaPropertyNames.includes(name))
  ];
  const properties = propertyNames.map((name) => [name, frontmatter[name]] as const);
  const editable = Boolean(onChange);
  const [propertiesExpanded, setPropertiesExpanded] = useState(true);
  const canCreateProperty = editable && (!database || Boolean(onCreateDatabaseProperty));

  if (!editable && properties.length === 0) {
    return null;
  }

  const updateProperty = (name: string, value: unknown) => {
    if (!onChange) return;
    const nextFrontmatter = { ...frontmatter };

    if (value === undefined) {
      delete nextFrontmatter[name];
    } else {
      nextFrontmatter[name] = value;
    }

    onChange(nextFrontmatter);
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
    <section className="group/properties relative mt-8" aria-label="Page properties">
      {(properties.length > 0 || database) && (
        <div className="mb-1 flex min-h-7 items-center gap-1">
          {properties.length > 0 && (
            <button
              type="button"
              aria-expanded={propertiesExpanded}
              tabIndex={propertiesExpanded ? -1 : undefined}
              className={propertiesExpanded
                ? "pointer-events-none flex h-7 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/properties:pointer-events-auto group-hover/properties:opacity-100"
                : "flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
              onClick={() => setPropertiesExpanded((expanded) => !expanded)}
            >
              {propertiesExpanded
                ? <CaretUp size={13} aria-hidden="true" />
                : <CaretDown size={13} aria-hidden="true" />}
              {propertiesExpanded ? "Hide properties" : "Show properties"}
            </button>
          )}
          {database && onSetDatabasePropertyVisibility && (
            <RecordPagePropertyVisibilityMenu
              properties={schemaPropertyNames}
              hiddenProperties={hiddenSchemaProperties}
              disabled={disabled}
              onChange={onSetDatabasePropertyVisibility}
            />
          )}
        </div>
      )}

      {propertiesExpanded && properties.length > 0 && (
        <dl className="space-y-1">
          {properties.map(([name, value]) => (
            <PropertyRow
              key={name}
              name={name}
              value={value}
              definition={database?.schema.properties[name]}
              allNames={properties.map(([propertyName]) => propertyName)}
              disabled={disabled}
              editable={editable}
              onDelete={() => deleteProperty(name)}
              onRename={(nextName) => renameProperty(name, nextName)}
              onRenameSchemaProperty={
                onRenameDatabaseProperty
                  ? (nextName) => onRenameDatabaseProperty(name, nextName)
                  : undefined
              }
              onChangeSchemaPropertyType={
                onChangeDatabasePropertyType
                  ? (type) => onChangeDatabasePropertyType(name, type)
                  : undefined
              }
              onDeleteSchemaProperty={
                onDeleteDatabaseProperty
                  ? () => onDeleteDatabaseProperty(name)
                  : undefined
              }
              onHideOnRecordPage={
                database?.schema.properties[name] && onSetDatabasePropertyVisibility
                  ? () => onSetDatabasePropertyVisibility(name, false)
                  : undefined
              }
              onChange={(nextValue) => updateProperty(name, nextValue)}
              onCreateOption={
                onCreateDatabaseOption
                  ? (option) => onCreateDatabaseOption(name, option)
                  : undefined
              }
              onChangeOptionColor={
                onChangeDatabaseOptionColor
                  ? (option, color) => onChangeDatabaseOptionColor(name, option, color)
                  : undefined
              }
              onRenameOption={
                onRenameDatabaseOption
                  ? (option, newName) => onRenameDatabaseOption(name, option, newName)
                  : undefined
              }
              onDeleteOption={
                onDeleteDatabaseOption
                  ? (option) => onDeleteDatabaseOption(name, option)
                  : undefined
              }
            />
          ))}
        </dl>
      )}

      {propertiesExpanded && canCreateProperty && (
        <PropertyCreateMenu
          existingNames={[
            ...schemaPropertyNames,
            ...Object.keys(frontmatter).filter((name) => !schemaPropertyNames.includes(name))
          ]}
          types={database ? DATABASE_PROPERTY_KIND_OPTIONS : PROPERTY_KIND_OPTIONS}
          disabled={disabled}
          onCreate={async (name, kind) => {
            if (database) {
              return await onCreateDatabaseProperty?.(
                name,
                kind as DatabasePropertyType
              ) ?? false;
            }
            onChange?.({ ...frontmatter, [name]: createPagePropertyValue(kind as PagePropertyKind) });
            return true;
          }}
          trigger={(
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1 h-7 text-muted-foreground"
            >
              <Plus size={13} aria-hidden="true" />
              Create new property
            </Button>
          )}
        />
      )}
    </section>
  );
}

function RecordPagePropertyVisibilityMenu({
  properties,
  hiddenProperties,
  disabled,
  onChange
}: {
  properties: readonly string[];
  hiddenProperties: ReadonlySet<string>;
  disabled: boolean;
  onChange: (property: string, visible: boolean) => Promise<boolean>;
}): ReactElement {
  const [busyProperty, setBusyProperty] = useState<string | null>(null);

  const toggle = async (property: string, visible: boolean) => {
    if (disabled || busyProperty !== null) return;
    setBusyProperty(property);
    try {
      await onChange(property, visible);
    } catch {
      // The owning page surface reports persistence failures.
    } finally {
      setBusyProperty(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded text-muted-foreground opacity-0 outline-none hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/properties:opacity-100"
          aria-label="Record page properties"
          title="Record page properties"
          disabled={disabled || busyProperty !== null}
        >
          <Eye size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        {properties.map((property) => {
          const visible = !hiddenProperties.has(property);
          return (
            <DropdownMenuItem
              key={property}
              disabled={disabled || busyProperty !== null}
              onSelect={(event) => {
                event.preventDefault();
                void toggle(property, !visible);
              }}
            >
              <span className="flex w-4 justify-center" aria-hidden="true">
                {visible ? <Check size={14} /> : null}
              </span>
              <span className="truncate">
                {busyProperty === property ? `${property}…` : property}
              </span>
            </DropdownMenuItem>
          );
        })}
        {properties.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No database properties yet</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface PropertyRowProps {
  name: string;
  value: unknown;
  definition?: DatabasePropertyDefinition | undefined;
  allNames: string[];
  disabled: boolean;
  editable: boolean;
  onChange: (value: unknown) => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onRenameSchemaProperty?: ((name: string) => Promise<boolean>) | undefined;
  onChangeSchemaPropertyType?: ((type: DatabasePropertyType) => Promise<boolean>) | undefined;
  onDeleteSchemaProperty?: (() => Promise<boolean>) | undefined;
  onHideOnRecordPage?: (() => Promise<boolean>) | undefined;
  onCreateOption?: ((option: string) => Promise<boolean>) | undefined;
  onChangeOptionColor?: ((option: string, color: DatabasePropertyOptionColor) => Promise<boolean>) | undefined;
  onRenameOption?: ((option: string, newName: string) => Promise<boolean>) | undefined;
  onDeleteOption?: ((option: string) => Promise<boolean>) | undefined;
}

function PropertyRow({
  name,
  value,
  definition,
  allNames,
  disabled,
  editable,
  onChange,
  onDelete,
  onRename,
  onRenameSchemaProperty,
  onChangeSchemaPropertyType,
  onDeleteSchemaProperty,
  onHideOnRecordPage,
  onCreateOption,
  onChangeOptionColor,
  onRenameOption,
  onDeleteOption
}: PropertyRowProps): ReactElement {
  const kind: PropertyEditorKind = definition?.type ?? pagePropertyKind(value);
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);

  if (!editable) {
    return (
      <div className="grid min-h-8 grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/70">
        <dt className="truncate text-muted-foreground" title={name}>
          {name}
        </dt>
        <dd className="min-w-0 break-words text-foreground">
          <PropertyValue kind={kind} value={value} options={definition?.options ?? []} />
        </dd>
      </div>
    );
  }

  return (
    <div className="grid min-h-9 grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] items-start gap-3 rounded-md px-2 py-1 text-sm hover:bg-muted/70 focus-within:bg-muted/70">
      <dt className="min-w-0">
        {renaming ? (
          <PropertyNameInput
            name={name}
            allNames={allNames}
            disabled={disabled}
            onFinish={() => setRenaming(false)}
            onRename={(nextName) => {
              if (definition && onRenameSchemaProperty) {
                void onRenameSchemaProperty(nextName);
              } else {
                onRename(nextName);
              }
            }}
          />
        ) : (
          <span
            className="block h-7 truncate rounded px-1 py-1 text-xs text-muted-foreground"
            title={`${name} — right-click for property options`}
            onContextMenu={(event) => {
              if (disabled) return;
              event.preventDefault();
              event.stopPropagation();
              setContextPoint({ x: event.clientX, y: event.clientY });
            }}
          >
            {name}
          </span>
        )}
      </dt>
      <dd className="min-w-0">
        <PropertyValueCell
          name={name}
          kind={kind}
          value={value}
          disabled={disabled}
          onChange={onChange}
          options={definition?.options ?? []}
          onCreateOption={onCreateOption}
          onChangeOptionColor={onChangeOptionColor}
          onRenameOption={onRenameOption}
          onDeleteOption={onDeleteOption}
        />
      </dd>
      {contextPoint && (
        <PropertyContextMenu
          point={contextPoint}
          currentKind={kind}
          schemaOwned={Boolean(definition)}
          schemaActionsAvailable={Boolean(
            onRenameSchemaProperty && onChangeSchemaPropertyType && onDeleteSchemaProperty
          )}
          onOpenChange={(open) => {
            if (!open) setContextPoint(null);
          }}
          onRename={() => setRenaming(true)}
          onChangeKind={(nextKind) => {
            if (definition && onChangeSchemaPropertyType) {
              void onChangeSchemaPropertyType(nextKind as DatabasePropertyType);
            } else {
              onChange(convertPagePropertyValue(value, nextKind as PagePropertyKind));
            }
          }}
          onDelete={() => {
            if (definition && onDeleteSchemaProperty) {
              void onDeleteSchemaProperty();
            } else {
              onDelete();
            }
          }}
          onHideOnRecordPage={onHideOnRecordPage}
        />
      )}
    </div>
  );
}

interface PropertyContextMenuProps {
  point: { x: number; y: number };
  currentKind: PropertyEditorKind;
  schemaOwned: boolean;
  schemaActionsAvailable: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
  onChangeKind: (kind: PropertyEditorKind) => void;
  onDelete: () => void;
  onHideOnRecordPage?: (() => Promise<boolean>) | undefined;
}

function PropertyContextMenu({
  point,
  currentKind,
  schemaOwned,
  schemaActionsAvailable,
  onOpenChange,
  onRename,
  onChangeKind,
  onDelete,
  onHideOnRecordPage
}: PropertyContextMenuProps): ReactElement {
  const kindOptions = schemaOwned ? DATABASE_PROPERTY_KIND_OPTIONS : PROPERTY_KIND_OPTIONS;
  const schemaActionDisabled = schemaOwned && !schemaActionsAvailable;

  return (
    <DropdownMenu open onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          className="fixed h-px w-px opacity-0"
          style={{ left: point.x, top: point.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuItem disabled={schemaActionDisabled} onSelect={onRename}>
          <PencilSimple size={16} aria-hidden="true" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={schemaActionDisabled}>
            <ArrowsClockwise size={16} aria-hidden="true" />
            Change type
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {kindOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                disabled={option.value === currentKind}
                onSelect={() => onChangeKind(option.value)}
              >
                <span className="flex w-4 justify-center" aria-hidden="true">
                  {option.value === currentKind && <Check size={14} />}
                </span>
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {schemaOwned && onHideOnRecordPage && (
          <DropdownMenuItem onSelect={() => void onHideOnRecordPage()}>
            <EyeSlash size={16} aria-hidden="true" />
            Hide on record pages
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={schemaActionDisabled}
          className="text-destructive focus:text-destructive"
          onSelect={onDelete}
        >
          <Trash size={16} aria-hidden="true" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface PropertyNameInputProps {
  name: string;
  allNames: string[];
  disabled: boolean;
  onFinish: () => void;
  onRename: (name: string) => void;
}

function PropertyNameInput({
  name,
  allNames,
  disabled,
  onFinish,
  onRename
}: PropertyNameInputProps): ReactElement {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(name);
    setError("");
  }, [name]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(name);
      setError("");
      onFinish();
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
    onFinish();
  };

  return (
    <input
      ref={inputRef}
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
  kind: PropertyEditorKind;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  onFinish: () => void;
  options: DatabasePropertyOption[];
  onCreateOption?: ((option: string) => Promise<boolean>) | undefined;
  onChangeOptionColor?: ((option: string, color: DatabasePropertyOptionColor) => Promise<boolean>) | undefined;
  onRenameOption?: ((option: string, newName: string) => Promise<boolean>) | undefined;
  onDeleteOption?: ((option: string) => Promise<boolean>) | undefined;
}

function PropertyValueCell({
  name,
  kind,
  value,
  disabled,
  onChange,
  options,
  onCreateOption,
  onChangeOptionColor,
  onRenameOption,
  onDeleteOption
}: Omit<PropertyValueEditorProps, "onFinish"> & { name: string }): ReactElement {
  const [editing, setEditing] = useState(false);

  if (kind === "checkbox") {
    return (
      <button
        type="button"
        aria-label={`Toggle ${name}`}
        aria-pressed={value === true}
        className="flex min-h-7 w-full items-center rounded px-1 py-1 text-left outline-none hover:bg-background focus:ring-2 focus:ring-ring disabled:opacity-50"
        disabled={disabled}
        onClick={() => onChange(value !== true)}
      >
        <CheckboxValue checked={value === true} />
      </button>
    );
  }

  if (editing) {
    return (
      <PropertyValueEditor
        kind={kind}
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={options}
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
      aria-label={`Edit ${name}`}
      className="min-h-7 w-full rounded px-1 py-1 text-left outline-none hover:bg-background focus:ring-2 focus:ring-ring disabled:opacity-50"
      disabled={disabled}
      onClick={() => setEditing(true)}
    >
      <PropertyValue
        kind={kind}
        value={value}
        options={options}
      />
    </button>
  );
}

function PropertyValueEditor({
  kind,
  value,
  disabled,
  onChange,
  onFinish,
  options,
  onCreateOption,
  onChangeOptionColor,
  onRenameOption,
  onDeleteOption
}: PropertyValueEditorProps): ReactElement {
  switch (kind) {
    case "checkbox": {
      const checked = value === true;
      const Icon = checked ? CheckSquare : Square;
      return (
        <button
          type="button"
          aria-pressed={checked}
          autoFocus
          className="flex h-7 w-full items-center gap-1.5 rounded border border-input bg-background px-1 text-left outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          disabled={disabled}
          onBlur={onFinish}
          onClick={() => {
            onChange(!checked);
            onFinish();
          }}
        >
          <Icon
            size={16}
            className={checked ? "text-sky-600" : "text-neutral-400"}
            aria-hidden="true"
          />
          <span className="sr-only">{checked ? "Checked" : "Unchecked"}</span>
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
          onFinish={onFinish}
        />
      );
    case "date":
      return (
        <input
          type="date"
          aria-label="Property date"
          className={propertyInputClassName}
          autoFocus
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onBlur={onFinish}
          onChange={(event) => {
            onChange(event.currentTarget.value);
            onFinish();
          }}
        />
      );
    case "list":
      return (
        <ListEditor
          values={Array.isArray(value) ? value : []}
          disabled={disabled}
          onChange={onChange}
          onFinish={onFinish}
        />
      );
    case "select":
    case "multi-select":
      return (
        <DatabaseOptionEditor
          mode={kind}
          value={value}
          options={options}
          disabled={disabled}
          onChange={onChange}
          onCreateOption={onCreateOption}
          onChangeOptionColor={onChangeOptionColor}
          onRenameOption={onRenameOption}
          onDeleteOption={onDeleteOption}
          onFinish={onFinish}
        />
      );
    case "json":
      return <JsonEditor value={value} disabled={disabled} onChange={onChange} onFinish={onFinish} />;
    case "text":
      return (
        <DraftInput
          ariaLabel="Property text"
          value={typeof value === "string" ? value : value == null ? "" : String(value)}
          disabled={disabled}
          parse={(draft) => ({ ok: true, value: draft })}
          onCommit={onChange}
          onFinish={onFinish}
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
  onFinish: () => void;
}

function DraftInput({
  ariaLabel,
  value,
  disabled,
  inputMode,
  parse,
  onCommit,
  onFinish
}: DraftInputProps): ReactElement {
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
      onFinish();
      return;
    }

    if (draft === value) {
      setError("");
      onFinish();
      return;
    }

    const result = parse(draft);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setError("");
    onCommit(result.value);
    onFinish();
  };

  return (
    <input
      aria-label={ariaLabel}
      aria-invalid={error ? true : undefined}
      title={error || undefined}
      className={propertyInputClassName}
      autoFocus
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
  onFinish: () => void;
}

function ListEditor({ values, disabled, onChange, onFinish }: ListEditorProps): ReactElement {
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    const nextValue = draft.trim();
    if (!nextValue) return;
    onChange([...values, nextValue]);
    setDraft("");
  };

  return (
    <div
      className="flex min-h-7 flex-wrap items-center gap-1 rounded border border-input bg-background px-1 focus-within:ring-2 focus-within:ring-ring"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onFinish();
        }
      }}
    >
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
        autoFocus
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
            onFinish();
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
  onFinish: () => void;
}

function JsonEditor({ value, disabled, onChange, onFinish }: JsonEditorProps): ReactElement {
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
      return true;
    }

    try {
      onChange(JSON.parse(draft) as unknown);
      setError("");
      return true;
    } catch {
      setError("Enter valid JSON before leaving this field.");
      return false;
    }
  };

  return (
    <textarea
      aria-label="Property JSON"
      aria-invalid={error ? true : undefined}
      title={error || undefined}
      className="min-h-16 w-full resize-y rounded border border-input bg-background px-2 py-1 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      autoFocus
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (commit()) onFinish();
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          if (commit()) onFinish();
        } else if (event.key === "Escape") {
          setDraft(formattedValue);
          setError("");
          onFinish();
        }
      }}
    />
  );
}

function PropertyValue({
  kind,
  value,
  options
}: {
  kind: PropertyEditorKind;
  value: unknown;
  options: DatabasePropertyOption[];
}): ReactElement {
  if (typeof value === "boolean") {
    return <CheckboxValue checked={value} />;
  }

  const selectedOptions = kind === "multi-select"
    ? Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : []
    : kind === "select" && typeof value === "string" && value
      ? [value]
      : null;

  if (selectedOptions) {
    return selectedOptions.length > 0 ? (
      <span className="flex flex-wrap gap-1">
        {selectedOptions.map((item) => (
          <DatabaseOptionPill
            key={item}
            option={optionForValue(item, options)}
          />
        ))}
      </span>
    ) : (
      <span className="text-muted-foreground">Empty</span>
    );
  }

  if (Array.isArray(value) && value.length === 0) {
    return <span className="text-muted-foreground">Empty</span>;
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

function CheckboxValue({ checked }: { checked: boolean }): ReactElement {
  const Icon = checked ? CheckSquare : Square;
  return (
    <span className="inline-flex items-center" title={checked ? "Checked" : "Unchecked"}>
      <Icon
        size={16}
        className={checked ? "text-sky-600" : "text-neutral-400"}
        aria-hidden="true"
      />
      <span className="sr-only">{checked ? "Checked" : "Unchecked"}</span>
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

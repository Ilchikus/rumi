import { BracketsCurly } from "@phosphor-icons/react/dist/csr/BracketsCurly";
import { CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { CheckSquare } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { Hash } from "@phosphor-icons/react/dist/csr/Hash";
import { ListBullets } from "@phosphor-icons/react/dist/csr/ListBullets";
import { Stack } from "@phosphor-icons/react/dist/csr/Stack";
import { Tag } from "@phosphor-icons/react/dist/csr/Tag";
import { TextT } from "@phosphor-icons/react/dist/csr/TextT";
import { cloneElement, useId, useState } from "react";
import type { ReactElement } from "react";
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

export interface PropertyCreateTypeOption<T extends string = string> {
  value: T;
  label: string;
}

export interface PropertyCreateMenuProps<T extends string = string> {
  trigger: ReactElement<any>;
  types: readonly PropertyCreateTypeOption<T>[];
  existingNames: readonly string[];
  disabled?: boolean;
  onCreate: (name: string, type: T) => Promise<boolean>;
}

export function propertyTypeIndexForQuery<T extends string>(
  types: readonly PropertyCreateTypeOption<T>[],
  query: string,
  defaultIndex: number
): number {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return defaultIndex;
  const prefix = types.findIndex((type) => type.label.toLocaleLowerCase().startsWith(normalized));
  if (prefix >= 0) return prefix;
  const contains = types.findIndex((type) => type.label.toLocaleLowerCase().includes(normalized));
  return contains >= 0 ? contains : defaultIndex;
}

export function movePropertyTypeIndex(
  current: number,
  delta: number,
  length: number
): number {
  return length > 0 ? (current + delta + length) % length : current;
}

export function propertyCreateEnterAction(typeConfirmed: boolean): "confirm-type" | "create" {
  return typeConfirmed ? "create" : "confirm-type";
}

export function propertyCreateNameError(
  name: string,
  existingNames: readonly string[]
): string {
  const propertyName = name.trim();
  if (!propertyName) return "Enter a property name.";
  if (existingNames.some(
    (existing) => existing.toLocaleLowerCase() === propertyName.toLocaleLowerCase()
  )) {
    return "A property with this name already exists.";
  }
  return "";
}

export function PropertyCreateMenu<T extends string>({
  trigger,
  types,
  existingNames,
  disabled = false,
  onCreate
}: PropertyCreateMenuProps<T>): ReactElement {
  const typeListId = useId();
  const defaultIndex = Math.max(0, types.findIndex((type) => type.value === "text"));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const [typeConfirmed, setTypeConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const activeType = types[activeIndex] ?? types[defaultIndex] ?? types[0];

  const reset = () => {
    setName("");
    setActiveIndex(defaultIndex);
    setTypeConfirmed(false);
    setCreating(false);
    setError("");
  };

  const create = async () => {
    const propertyName = name.trim();
    const nameError = propertyCreateNameError(propertyName, existingNames);
    if (nameError) {
      setError(nameError);
      return;
    }
    if (!activeType || creating) return;
    setCreating(true);
    setError("");
    try {
      const created = await onCreate(propertyName, activeType.value);
      if (created) {
        setOpen(false);
        reset();
      } else {
        setError("The property could not be created.");
      }
    } catch {
      setError("The property could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const focusTypeForName = (value: string) => {
    setActiveIndex(propertyTypeIndexForQuery(types, value, defaultIndex));
  };

  const move = (delta: number) => {
    if (types.length === 0) return;
    setActiveIndex((current) => movePropertyTypeIndex(current, delta, types.length));
    setTypeConfirmed(false);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DropdownMenuTrigger asChild>
        {cloneElement(trigger, { disabled: disabled || Boolean(trigger.props.disabled) })}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 p-2"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
          Property name
        </label>
        <input
          autoFocus
          value={name}
          placeholder="Name or type, e.g. Date"
          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          role="combobox"
          aria-label="Property name"
          aria-expanded={open}
          aria-controls={typeListId}
          aria-activedescendant={
            activeType ? `${typeListId}-${activeType.value}` : undefined
          }
          disabled={creating}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setName(value);
            setError("");
            setTypeConfirmed(false);
            focusTypeForName(value);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              reset();
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              move(3);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-3);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (propertyCreateEnterAction(typeConfirmed) === "confirm-type") {
                setTypeConfirmed(true);
                setError("");
              } else {
                void create();
              }
            }
          }}
        />

        <div
          id={typeListId}
          className="mt-2 grid grid-cols-3 gap-1"
          role="listbox"
          aria-label="Property type"
        >
          {types.map((type, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={type.value}
                id={`${typeListId}-${type.value}`}
                type="button"
                role="option"
                aria-selected={active}
                disabled={creating}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border border-transparent px-1 py-2 text-center text-[11px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground",
                  active && "border-border bg-muted text-foreground",
                  active && typeConfirmed && "ring-2 ring-ring"
                )}
                onClick={() => {
                  setActiveIndex(index);
                  setTypeConfirmed(true);
                  setError("");
                }}
              >
                {propertyTypeIcon(type.value)}
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Enter confirms {activeType?.label ?? "type"}; Enter again creates.
          </p>
        )}

        <button
          type="button"
          className="mt-2 h-8 w-full rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={creating || !activeType}
          onClick={() => void create()}
        >
          {creating ? "Creating…" : `Create ${activeType?.label ?? "property"}`}
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function propertyTypeIcon(type: string): ReactElement {
  const props = { size: 19, "aria-hidden": true } as const;
  switch (type) {
    case "number":
      return <Hash {...props} />;
    case "date":
      return <CalendarBlank {...props} />;
    case "checkbox":
      return <CheckSquare {...props} />;
    case "select":
      return <Tag {...props} />;
    case "multi-select":
      return <Stack {...props} />;
    case "list":
      return <ListBullets {...props} />;
    case "json":
      return <BracketsCurly {...props} />;
    default:
      return <TextT {...props} />;
  }
}

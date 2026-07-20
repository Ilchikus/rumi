import type { DatabasePropertyOption } from "@rumi/contracts";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export interface DatabaseOptionEditorProps {
  mode: "select" | "multi-select";
  value: unknown;
  options: DatabasePropertyOption[];
  disabled: boolean;
  onChange: (value: string | string[] | undefined) => void;
  onCreateOption?: ((name: string) => Promise<boolean>) | undefined;
  onFinish: () => void;
}

export type DatabaseOptionChoice = { type: "option"; name: string } | { type: "create" };

export function rankDatabasePropertyOptions(
  options: DatabasePropertyOption[],
  query: string
): DatabasePropertyOption[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return options;
  }

  return options
    .map((option, index) => {
      const name = option.name.toLowerCase();
      const rank = name === normalizedQuery ? 0 : name.startsWith(normalizedQuery) ? 1 : name.includes(normalizedQuery) ? 2 : -1;
      return { option, index, rank };
    })
    .filter((candidate) => candidate.rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((candidate) => candidate.option);
}

export function databasePropertyOptionChoices(
  options: DatabasePropertyOption[],
  query: string,
  allowCreate: boolean
): DatabaseOptionChoice[] {
  const normalizedQuery = query.trim().toLowerCase();
  const exactMatch = options.some((option) => option.name.toLowerCase() === normalizedQuery);
  return [
    ...rankDatabasePropertyOptions(options, query).map(
      (option): DatabaseOptionChoice => ({ type: "option", name: option.name })
    ),
    ...(allowCreate && !exactMatch ? [{ type: "create" } as const] : [])
  ];
}

export function DatabaseOptionEditor({
  mode,
  value,
  options,
  disabled,
  onChange,
  onCreateOption,
  onFinish
}: DatabaseOptionEditorProps): ReactElement {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 224 });
  const selected = useMemo(
    () =>
      mode === "multi-select"
        ? Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : []
        : typeof value === "string" && value
          ? [value]
          : [],
    [mode, value]
  );
  const filteredOptions = useMemo(() => rankDatabasePropertyOptions(options, search), [options, search]);
  const normalizedSearch = search.trim();
  const choices = databasePropertyOptionChoices(options, search, Boolean(onCreateOption));
  const showCreate = choices.some((choice) => choice.type === "create");
  const canCreate = Boolean(onCreateOption && normalizedSearch && showCreate);
  const activeChoice = choices[Math.min(activeIndex, Math.max(choices.length - 1, 0))];

  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;

      const width = Math.max(224, rect.width);
      setPosition({
        left: Math.min(rect.left, Math.max(8, window.innerWidth - width - 8)),
        top: rect.bottom + 4,
        width
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onFinish();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onFinish]);

  const chooseOption = (name: string) => {
    if (mode === "select") {
      onChange(name);
      onFinish();
      return;
    }

    onChange(selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name]);
    setSearch("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const createOption = async () => {
    if (!canCreate || !onCreateOption || creating) return;
    setCreating(true);
    setError("");

    try {
      const created = await onCreateOption(normalizedSearch);
      if (!created) return;
      chooseOption(normalizedSearch);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this option.");
    } finally {
      setCreating(false);
    }
  };

  const activateChoice = () => {
    if (!activeChoice) return;
    if (activeChoice.type === "create") {
      void createOption();
    } else {
      chooseOption(activeChoice.name);
    }
  };

  return (
    <>
      <div ref={anchorRef} className="flex min-h-7 items-center rounded border border-input bg-background px-1">
        <input
          ref={inputRef}
          aria-label={mode === "select" ? "Search select options" : "Search multi-select options"}
          aria-activedescendant={activeChoice ? choiceId(activeChoice) : undefined}
          aria-controls="database-property-options"
          aria-expanded="true"
          role="combobox"
          autoComplete="off"
          className="h-6 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          value={search}
          disabled={disabled}
          placeholder="Search or create…"
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && choices.length > 0) {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % choices.length);
            } else if (event.key === "ArrowUp" && choices.length > 0) {
              event.preventDefault();
              setActiveIndex((current) => (current - 1 + choices.length) % choices.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              activateChoice();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onFinish();
            } else if (event.key === "Backspace" && !search && mode === "select" && selected.length > 0) {
              onChange(undefined);
            }
          }}
        />
      </div>

      {createPortal(
        <div
          ref={panelRef}
          id="database-property-options"
          role="listbox"
          aria-multiselectable={mode === "multi-select" ? true : undefined}
          className="fixed z-50 max-h-64 overflow-y-auto rounded-md border border-border bg-background p-1 text-sm text-foreground shadow-md"
          style={position}
        >
          {mode === "select" && selected.length > 0 && !search && (
            <button
              type="button"
              className="flex h-8 w-full items-center rounded px-2 text-left text-muted-foreground hover:bg-accent"
              onClick={() => {
                onChange(undefined);
                onFinish();
              }}
            >
              Clear
            </button>
          )}

          {filteredOptions.map((option, index) => {
            const selectedOption = selected.includes(option.name);
            const active = activeChoice?.type === "option" && activeChoice.name === option.name;
            return (
              <button
                key={option.name}
                id={choiceId({ type: "option", name: option.name })}
                type="button"
                role="option"
                aria-selected={selectedOption}
                className={cn(
                  "flex min-h-8 w-full items-center gap-2 rounded px-2 text-left",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent/70"
                )}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => chooseOption(option.name)}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                  {selectedOption && <Check size={13} />}
                </span>
                <OptionPill option={option} />
              </button>
            );
          })}

          {filteredOptions.length === 0 && !showCreate && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {normalizedSearch ? "No matching options" : "No options yet"}
            </p>
          )}

          {showCreate && (
            <button
              id={choiceId({ type: "create" })}
              type="button"
              className={cn(
                "flex min-h-8 w-full items-center gap-2 rounded px-2 text-left text-primary",
                activeChoice?.type === "create" ? "bg-accent" : "hover:bg-accent/70"
              )}
              disabled={creating || !canCreate}
              onPointerMove={() => setActiveIndex(filteredOptions.length)}
              onClick={() => void createOption()}
            >
              <Plus size={14} aria-hidden="true" />
              {creating
                ? "Creating…"
                : normalizedSearch
                  ? `Create “${normalizedSearch}”`
                  : "Create new option"}
            </button>
          )}

          {error && <p className="px-2 py-2 text-xs text-destructive">{error}</p>}
        </div>,
        document.body
      )}
    </>
  );
}

function OptionPill({ option }: { option: DatabasePropertyOption }): ReactElement {
  return (
    <span
      className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-xs"
      data-option-color={option.color}
    >
      {option.name}
    </span>
  );
}

function choiceId(choice: DatabaseOptionChoice): string {
  return choice.type === "create"
    ? "database-property-option-create"
    : `database-property-option-${choice.name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

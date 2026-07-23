import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../ui/dropdown-menu";
import { Input } from "../../../ui/input";

export interface CodeLanguageOption {
  value: string;
  label: string;
  keywords?: string;
}
export const CODE_LANGUAGE_OPTIONS: readonly CodeLanguageOption[] = [
  { value: "", label: "Plain text", keywords: "none txt" },
  { value: "javascript", label: "JavaScript", keywords: "js" },
  { value: "typescript", label: "TypeScript", keywords: "ts" },
  { value: "python", label: "Python", keywords: "py" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML", keywords: "xml web" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash", keywords: "sh shell terminal" },
  { value: "markdown", label: "Markdown", keywords: "md" },
  { value: "sql", label: "SQL" },
  { value: "go", label: "Go", keywords: "golang" },
  { value: "rust", label: "Rust", keywords: "rs" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++", keywords: "cpp c" },
  { value: "ruby", label: "Ruby", keywords: "rb" },
  { value: "yaml", label: "YAML", keywords: "yml" },
  { value: "xml", label: "XML" }
];

export function filterCodeLanguages(query: string): readonly CodeLanguageOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return CODE_LANGUAGE_OPTIONS;

  return CODE_LANGUAGE_OPTIONS.filter((option) => (
    `${option.label} ${option.value} ${option.keywords ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery)
  ));
}

export function CodeLanguagePicker({
  value,
  onChange
}: {
  value: string;
  onChange: (language: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const options = useMemo(() => filterCodeLanguages(query), [query]);
  const selected = CODE_LANGUAGE_OPTIONS.find((option) => option.value === value)
    ?? CODE_LANGUAGE_OPTIONS[0]!;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const chooseLanguage = (language: string) => {
    onChange(language);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-[11px] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Code language"
          title="Code language"
        >
          <span>{selected.label}</span>
          <CaretDown size={11} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="relative mb-1 px-1" onPointerDown={(event) => event.stopPropagation()}>
          <MagnifyingGlass
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={searchRef}
            value={query}
            className="h-8 pl-7 text-xs"
            placeholder="Search languages"
            aria-label="Search code languages"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              } else if (event.key === "Enter" && options[0]) {
                event.preventDefault();
                chooseLanguage(options[0].value);
              }
            }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {options.length > 0 ? options.map((option) => (
            <DropdownMenuItem
              key={option.value || "plain-text"}
              onSelect={() => chooseLanguage(option.value)}
            >
              <span className="flex w-4 justify-center" aria-hidden="true">
                {option.value === value && <Check size={14} />}
              </span>
              <span>{option.label}</span>
            </DropdownMenuItem>
          )) : (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No languages found
            </p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

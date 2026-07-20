import {
  DATABASE_PROPERTY_OPTION_COLORS,
  type DatabasePropertyOption,
  type DatabasePropertyOptionColor
} from "@rumi/contracts";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { useState } from "react";
import type { ReactElement } from "react";
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";

const OPTION_COLOR_CLASSES: Record<DatabasePropertyOptionColor, string> = {
  neutral: "border-neutral-300 bg-neutral-100 text-neutral-600",
  blue: "border-blue-300 bg-blue-100 text-blue-600",
  orange: "border-orange-300 bg-orange-100 text-orange-600",
  rose: "border-rose-300 bg-rose-100 text-rose-600",
  yellow: "border-yellow-300 bg-yellow-100 text-yellow-600",
  teal: "border-teal-300 bg-teal-100 text-teal-600",
  violet: "border-violet-300 bg-violet-100 text-violet-600",
  lime: "border-lime-300 bg-lime-100 text-lime-600",
  cyan: "border-cyan-300 bg-cyan-100 text-cyan-600",
  fuchsia: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-600"
};

export interface DatabaseOptionPillProps {
  option: DatabasePropertyOption;
  className?: string;
  disabled?: boolean;
  onColorChange?: ((color: DatabasePropertyOptionColor) => void | Promise<unknown>) | undefined;
}

export function DatabaseOptionPill({
  option,
  className,
  disabled = false,
  onColorChange
}: DatabaseOptionPillProps): ReactElement {
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null);
  const color = databaseOptionColor(option.color);

  return (
    <>
      <span
        className={cn(
          "inline-flex max-w-full items-center truncate rounded border px-1.5 py-0.5 text-xs font-medium",
          OPTION_COLOR_CLASSES[color],
          onColorChange && !disabled && "cursor-context-menu",
          className
        )}
        data-option-color={color}
        title={onColorChange && !disabled ? `${option.name} — right-click to change color` : option.name}
        onContextMenu={(event) => {
          if (!onColorChange || disabled) return;
          event.preventDefault();
          event.stopPropagation();
          setContextPoint({ x: event.clientX, y: event.clientY });
        }}
      >
        {option.name}
      </span>

      {contextPoint && onColorChange && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) setContextPoint(null);
          }}
        >
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden="true"
              className="fixed h-px w-px opacity-0"
              style={{ left: contextPoint.x, top: contextPoint.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            aria-label={`Color for ${option.name}`}
            data-database-option-color-menu="true"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            {DATABASE_PROPERTY_OPTION_COLORS.map((candidate) => (
              <DropdownMenuItem
                key={candidate}
                disabled={disabled}
                onSelect={() => void onColorChange(candidate)}
              >
                <span
                  className={cn("h-4 w-4 rounded border", OPTION_COLOR_CLASSES[candidate])}
                  aria-hidden="true"
                />
                <span className="capitalize">{candidate}</span>
                <span className="ml-auto flex w-4 justify-end" aria-hidden="true">
                  {candidate === color && <Check size={13} />}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

export function databaseOptionColor(color: string | undefined): DatabasePropertyOptionColor {
  const legacyColors: Record<string, DatabasePropertyOptionColor> = {
    sky: "cyan",
    emerald: "teal",
    purple: "violet",
    green: "lime",
    red: "rose"
  };
  return DATABASE_PROPERTY_OPTION_COLORS.find((candidate) => candidate === color)
    ?? (color ? legacyColors[color] : undefined)
    ?? "neutral";
}

export function randomDatabaseOptionColor(random = Math.random): DatabasePropertyOptionColor {
  const index = Math.floor(random() * DATABASE_PROPERTY_OPTION_COLORS.length);
  return DATABASE_PROPERTY_OPTION_COLORS[index] ?? "neutral";
}

export function optionForValue(
  value: string,
  options: DatabasePropertyOption[]
): DatabasePropertyOption {
  return options.find((option) => option.name === value) ?? { name: value, color: "neutral" };
}

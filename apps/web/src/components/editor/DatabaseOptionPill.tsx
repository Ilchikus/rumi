import {
  DATABASE_PROPERTY_OPTION_COLORS,
  type DatabasePropertyOption,
  type DatabasePropertyOptionColor
} from "@rumi/contracts";
import { X } from "@phosphor-icons/react/dist/csr/X";
import type { ReactElement } from "react";
import { cn } from "../../lib/utils";

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
  onRemove?: (() => void) | undefined;
}

export function DatabaseOptionPill({
  option,
  className,
  disabled = false,
  onRemove
}: DatabaseOptionPillProps): ReactElement {
  const color = databaseOptionColor(option.color);

  return (
    <span
      className={cn(
        "inline-flex max-w-full cursor-default items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs font-medium",
        OPTION_COLOR_CLASSES[color],
        className
      )}
      data-option-color={color}
      title={option.name}
    >
      <span className="truncate">
        {option.name}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${option.name}`}
          className="-mr-0.5 grid h-3.5 w-3.5 cursor-default place-items-center rounded-sm opacity-65 outline-none hover:opacity-100 focus-visible:ring-1 focus-visible:ring-current disabled:opacity-35"
          disabled={disabled}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
        >
          <X size={10} weight="bold" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

export function databaseOptionColorClassName(color: DatabasePropertyOptionColor): string {
  return OPTION_COLOR_CLASSES[color];
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

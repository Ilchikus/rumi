import type { ButtonHTMLAttributes, ReactElement } from "react";
import { cn } from "../../lib/utils";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "onClick"> {
  animate?: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({
  animate = true,
  checked,
  className,
  disabled,
  onCheckedChange,
  ...props
}: SwitchProps): ReactElement {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        animate && "transition-colors",
        checked ? "bg-sky-600" : "bg-neutral-300",
        className
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block h-4 w-4 rounded-full bg-white shadow-sm",
          animate && "transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

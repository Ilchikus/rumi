import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactElement } from "react";
import { SidebarSimple } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { cn } from "../../lib/utils";

export const EditorHeaderIconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function EditorHeaderIconButton({ className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "group grid h-8 w-8 shrink-0 place-items-center rounded-md border-0 bg-transparent text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground",
        className
      )}
      {...props}
    />
  );
});

export function EditorHeaderSidebarIcon({ collapsed }: { collapsed: boolean }): ReactElement {
  return (
    <span className="relative block h-[18px] w-[18px]" aria-hidden="true">
      <SidebarSimple
        size={18}
        weight={collapsed ? "regular" : "fill"}
        className="absolute inset-0 group-hover:opacity-0"
      />
      <SidebarSimple
        size={18}
        weight={collapsed ? "fill" : "regular"}
        className="absolute inset-0 opacity-0 group-hover:opacity-100"
      />
    </span>
  );
}

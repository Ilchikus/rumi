import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "border-border bg-background text-foreground shadow-lg",
          description: "text-muted-foreground",
          actionButton: "bg-action text-action-foreground hover:bg-action-hover",
          cancelButton: "bg-muted text-muted-foreground"
        }
      }}
      {...props}
    />
  );
}

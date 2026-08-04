import type { ReactElement } from "react";
import {
  getSavedSidebarCollapsed,
  getSavedSidebarWidth,
  sidebarWidthForViewport
} from "../../lib/sidebarLayout";
import { EDITOR_ADDRESS_BAR_CONTAINER_CLASS } from "./EditorPageLayout";

export function WorkspaceLoadingShell(): ReactElement {
  const sidebarCollapsed = getSavedSidebarCollapsed();
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const isNarrow = viewportWidth < 768;
  const sidebarWidth = sidebarWidthForViewport(getSavedSidebarWidth(), viewportWidth);

  return (
    <main
      className="flex h-screen max-h-screen min-h-0 overflow-hidden bg-background text-foreground"
      data-rumi-workspace-shell=""
      aria-busy="true"
    >
      {!sidebarCollapsed ? (
        <aside
          className={isNarrow
            ? "fixed inset-y-0 left-0 z-40 h-screen min-h-0 border-r border-border bg-neutral-50 shadow-xl"
            : "h-screen min-h-0 shrink-0 border-r border-border bg-neutral-50"
          }
          style={{ width: sidebarWidth }}
          aria-hidden="true"
        >
          <div className="min-h-14" />
        </aside>
      ) : null}
      <section className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
        isNarrow && !sidebarCollapsed ? "blur-sm" : ""
      }`}>
        <header className="min-h-14 shrink-0 py-2.5" aria-hidden="true">
          <div className={EDITOR_ADDRESS_BAR_CONTAINER_CLASS}>
            <div className="h-9 rounded-lg bg-neutral-100" />
          </div>
        </header>
        <div className="min-h-0 flex-1" />
      </section>
    </main>
  );
}

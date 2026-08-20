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
            ? "fixed inset-y-0 left-0 z-40 h-screen min-h-0 border-r border-border bg-sidebar shadow-xl"
            : "h-screen min-h-0 shrink-0 border-r border-border bg-sidebar"
          }
          style={{ width: sidebarWidth }}
          aria-hidden="true"
        >
          <div className="min-h-14" />
        </aside>
      ) : null}
      <section className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
        isNarrow && !sidebarCollapsed ? "blur-sm" : ""
      }`}>
        <header
          className="pointer-events-none absolute inset-x-0 top-0 z-20 min-h-14 bg-transparent py-2.5"
          data-rumi-workspace-header=""
          aria-hidden="true"
        >
          <div className={EDITOR_ADDRESS_BAR_CONTAINER_CLASS}>
            <div className="h-9 rounded-lg bg-surface-subtle" />
          </div>
        </header>
        <div className="min-h-0 flex-1" />
      </section>
    </main>
  );
}

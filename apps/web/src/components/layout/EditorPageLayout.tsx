import type { ReactElement, ReactNode } from "react";
import { EditablePageTitle } from "../editor/EditablePageTitle";

// The page icon and the "Add icon" control (68px plus a 12px gap) sit in the
// top padding, 32px below the 56px overlaid workspace header, so the title is
// in the same place with or without an icon.
export const EDITOR_PAGE_CONTAINER_CLASS =
  "mx-auto w-full max-w-[820px] px-6 pb-24 pt-[10.5rem] sm:px-10 lg:px-12";

export const EDITOR_ADDRESS_BAR_CONTAINER_CLASS =
  "mx-auto w-full max-w-[820px] px-6 sm:px-10 lg:px-12";

export function EditorPageLayout({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className="relative min-h-0 flex-1 overflow-y-auto"
      data-rumi-editor-canvas=""
      data-rumi-system-page={title}
    >
      <article className={EDITOR_PAGE_CONTAINER_CLASS}>
        <EditablePageTitle
          title={title}
          editable={false}
          onRename={async () => false}
          onSplit={async () => false}
        />
        <div className="mt-10">{children}</div>
      </article>
    </div>
  );
}

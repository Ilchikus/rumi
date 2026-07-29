import type { ReactElement, ReactNode } from "react";
import { EditablePageTitle } from "../editor/EditablePageTitle";

export const EDITOR_PAGE_CONTAINER_CLASS =
  "mx-auto w-full max-w-[820px] px-6 pb-24 pt-12 sm:px-10 sm:pt-16 lg:px-12";

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

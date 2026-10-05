import type { ReactElement } from "react";
import { Smiley } from "@phosphor-icons/react/dist/csr/Smiley";
import { parseWorkspaceIcon } from "../../lib/workspaceIcons";
import { WorkspaceIcon } from "./WorkspaceIcon";

/**
 * The item's custom icon above its title. Without one, an "Add icon" control
 * appears on hover in the space above the title so the title never shifts.
 * Place inside an element with the `group/page-header` class.
 */
export function PageIconHeader({
  icon,
  editable,
  onChangeIcon
}: {
  icon: string | undefined;
  editable: boolean;
  onChangeIcon: () => void;
}): ReactElement | null {
  if (parseWorkspaceIcon(icon)) {
    return (
      <button
        type="button"
        className="-ml-1.5 mb-3 grid rounded-lg p-1.5 text-neutral-500 transition-colors enabled:hover:bg-accent disabled:cursor-default"
        aria-label="Change icon"
        title={editable ? "Change icon" : undefined}
        disabled={!editable}
        onClick={onChangeIcon}
        data-page-icon=""
      >
        <WorkspaceIcon icon={icon} size={56} />
      </button>
    );
  }

  if (!editable) return null;

  return (
    <div className="relative h-0">
      <button
        type="button"
        className="absolute -top-9 left-0 flex h-7 items-center gap-1.5 rounded-md px-1.5 text-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/page-header:opacity-100"
        onClick={onChangeIcon}
        data-page-add-icon=""
      >
        <Smiley size={16} />
        Add icon
      </button>
    </div>
  );
}

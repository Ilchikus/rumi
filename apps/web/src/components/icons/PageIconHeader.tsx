import type { ReactElement } from "react";
import { Smiley } from "@phosphor-icons/react/dist/csr/Smiley";
import { parseWorkspaceIcon } from "../../lib/workspaceIcons";
import { WorkspaceIcon } from "./WorkspaceIcon";

// The icon and the "Add icon" control share one square slot in the page's top
// padding, 12px above the title: a 56px icon in 6px padding, offset left so the
// icon lines up with the title text.
const ICON_SLOT_CLASS = "absolute bottom-3 left-0 -ml-1.5 grid place-items-center rounded-lg p-1.5";
const ICON_SIZE = 56;

/**
 * The item's custom icon above its title. Without one, an "Add icon" control
 * the same size appears in the same place while the pointer is over it. Both
 * sit in the space above the title, so the title never shifts.
 */
export function PageIconHeader({
  icon,
  onChangeIcon
}: {
  icon: string | undefined;
  onChangeIcon: () => void;
}): ReactElement {
  const hasIcon = Boolean(parseWorkspaceIcon(icon));

  return (
    <div className="relative h-0">
      {hasIcon ? (
        <button
          type="button"
          className={`${ICON_SLOT_CLASS} text-neutral-500 transition-colors hover:bg-accent`}
          aria-label="Change icon"
          title="Change icon"
          onClick={onChangeIcon}
          data-page-icon=""
        >
          <WorkspaceIcon icon={icon} size={ICON_SIZE} />
        </button>
      ) : (
        <button
          type="button"
          className={`${ICON_SLOT_CLASS} text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100`}
          aria-label="Add icon"
          title="Add icon"
          onClick={onChangeIcon}
          data-page-add-icon=""
        >
          <span className="grid place-items-center" style={{ width: ICON_SIZE, height: ICON_SIZE }}>
            <Smiley size={28} />
          </span>
        </button>
      )}
    </div>
  );
}

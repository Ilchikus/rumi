import { useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { parseWorkspaceIcon, workspaceIconAssetUrl } from "../../lib/workspaceIcons";
import { usePhosphorCatalog } from "./phosphorCatalog";

export interface WorkspaceIconProps {
  /** Raw frontmatter icon value; anything unrecognized renders `fallback`. */
  icon: string | null | undefined;
  size: number;
  /** The item's kind icon, shown when it has no custom icon. Never shown alongside one. */
  fallback?: ReactNode;
  className?: string;
}

export function WorkspaceIcon({ icon, size, fallback = null, className }: WorkspaceIconProps): ReactElement {
  const parsed = parseWorkspaceIcon(icon);
  const catalog = usePhosphorCatalog(parsed?.type === "phosphor");
  const box: CSSProperties = { width: size, height: size };

  if (!parsed) return <>{fallback}</>;

  if (parsed.type === "emoji") {
    return (
      <span
        className={cn("inline-grid shrink-0 select-none place-items-center leading-none", className)}
        style={{ ...box, fontSize: Math.round(size * 0.86) }}
        aria-hidden="true"
        data-workspace-icon="emoji"
      >
        {parsed.emoji}
      </span>
    );
  }

  if (parsed.type === "asset") {
    return (
      <UploadedIcon
        src={workspaceIconAssetUrl(parsed)}
        size={size}
        fallback={fallback}
        {...(className ? { className } : {})}
      />
    );
  }

  const definition = catalog?.byName.get(parsed.name);
  if (catalog && !definition) return <>{fallback}</>;

  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      data-workspace-icon="phosphor"
    >
      {definition ? <path d={definition.path} /> : null}
    </svg>
  );
}

function UploadedIcon({
  src,
  size,
  fallback,
  className
}: {
  src: string;
  size: number;
  fallback: ReactNode;
  className?: string;
}): ReactElement {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className={cn("shrink-0 rounded-[3px] object-contain", className)}
      style={{ width: size, height: size }}
      data-workspace-icon="asset"
      onError={() => setFailedSrc(src)}
    />
  );
}

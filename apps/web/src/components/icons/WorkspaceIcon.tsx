import { useState, type ReactElement, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { parseWorkspaceIcon } from "../../lib/workspaceIcons";
import { drawableWorkspaceIcon } from "./drawableIcon";
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
  const loadsGlyph = parseWorkspaceIcon(icon)?.type === "phosphor";
  const catalog = usePhosphorCatalog(loadsGlyph);
  const drawable = drawableWorkspaceIcon(icon, catalog);

  if (!drawable) {
    // Keep the glyph's space while the icon catalog loads, so rows never shift.
    return loadsGlyph && !catalog
      ? <span className={cn("inline-block shrink-0", className)} style={{ width: size, height: size }} />
      : <>{fallback}</>;
  }

  if (drawable.type === "emoji") {
    return (
      <span
        className={cn("inline-grid shrink-0 select-none place-items-center leading-none", className)}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.86) }}
        aria-hidden="true"
        data-workspace-icon="emoji"
      >
        {drawable.emoji}
      </span>
    );
  }

  if (drawable.type === "image") {
    return (
      <UploadedIcon
        src={drawable.url}
        size={size}
        fallback={fallback}
        {...(className ? { className } : {})}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...(drawable.color ? { style: { color: drawable.color } } : {})}
      data-workspace-icon="phosphor"
    >
      <path d={drawable.path} />
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

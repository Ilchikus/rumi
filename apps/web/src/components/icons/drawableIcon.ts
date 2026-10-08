import { assetEndpointUrl } from "../../lib/mediaAssets";
import { parseWorkspaceIcon, workspaceIconColorHex } from "../../lib/workspaceIcons";
import { loadPhosphorCatalog, peekPhosphorCatalog, type PhosphorCatalog } from "./phosphorCatalog";

/** A stored icon resolved to what every renderer draws. */
export type DrawableWorkspaceIcon =
  | { type: "emoji"; emoji: string }
  | { type: "image"; url: string }
  | { type: "glyph"; path: string; color?: string };

/**
 * Resolves a frontmatter icon value. Unrecognized values, unknown Phosphor
 * names, and Phosphor icons whose catalog has not loaded resolve to null.
 */
export function drawableWorkspaceIcon(
  value: string | null | undefined,
  catalog: PhosphorCatalog | null = peekPhosphorCatalog()
): DrawableWorkspaceIcon | null {
  const icon = parseWorkspaceIcon(value);
  if (!icon) return null;
  if (icon.type === "emoji") return icon;
  if (icon.type === "asset") return { type: "image", url: assetEndpointUrl(icon.path) };

  const path = catalog?.byName.get(icon.name)?.path;
  if (!path) return null;
  const color = workspaceIconColorHex(icon.color);
  return color ? { type: "glyph", path, color } : { type: "glyph", path };
}

/** Like drawableWorkspaceIcon, loading the Phosphor catalog first when the icon needs it. */
export async function loadDrawableWorkspaceIcon(
  value: string | null | undefined
): Promise<DrawableWorkspaceIcon | null> {
  const needsCatalog = parseWorkspaceIcon(value)?.type === "phosphor";
  return drawableWorkspaceIcon(value, needsCatalog ? await loadPhosphorCatalog() : null);
}

/** Browser-tab icon: emoji and glyphs become SVG, uploads use the asset. */
export function workspaceFaviconHref(icon: DrawableWorkspaceIcon): string {
  if (icon.type === "image") return icon.url;
  const svg = icon.type === "emoji"
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="50" dy=".35em" text-anchor="middle" font-size="86">${escapeXml(icon.emoji)}</text></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="${icon.color ?? "#737373"}"><path d="${escapeXml(icon.path)}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/gu, (character) => `&#${character.charCodeAt(0)};`);
}

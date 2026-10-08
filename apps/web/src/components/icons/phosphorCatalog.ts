import { lazyResource, useLazyResource } from "../../lib/lazyResource";

export interface PhosphorIconDefinition {
  name: string;
  tags: string;
  path: string;
}

interface GeneratedPhosphorCatalog {
  icons: Array<[name: string, tags: string, path: string]>;
}

export interface PhosphorCatalog {
  icons: readonly PhosphorIconDefinition[];
  byName: ReadonlyMap<string, PhosphorIconDefinition>;
}

/** The full icon set is a separate chunk, loaded when a picker or a `ph:` icon needs it. */
const phosphorCatalog = lazyResource(async (): Promise<PhosphorCatalog> => {
  const module = await import("./phosphor-catalog.generated.json");
  const generated = (module.default ?? module) as unknown as GeneratedPhosphorCatalog;
  const icons = generated.icons.map(([name, tags, path]) => ({ name, tags, path }));
  return { icons, byName: new Map(icons.map((icon) => [icon.name, icon])) };
});

export const loadPhosphorCatalog = phosphorCatalog.load;
export const peekPhosphorCatalog = phosphorCatalog.peek;

export function usePhosphorCatalog(enabled = true): PhosphorCatalog | null {
  return useLazyResource(phosphorCatalog, enabled);
}

export function searchPhosphorIcons(
  catalog: PhosphorCatalog,
  query: string,
  limit: number
): PhosphorIconDefinition[] {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return catalog.icons.slice(0, limit);

  const scored: Array<{ icon: PhosphorIconDefinition; score: number }> = [];
  for (const icon of catalog.icons) {
    let score = 0;
    for (const term of terms) {
      if (icon.name === term) score += 0;
      else if (icon.name.startsWith(term)) score += 1;
      else if (icon.name.includes(term)) score += 2;
      else if (icon.tags.includes(term)) score += 3;
      else {
        score = -1;
        break;
      }
    }
    if (score >= 0) scored.push({ icon, score });
  }

  return scored
    .sort((left, right) => left.score - right.score || left.icon.name.localeCompare(right.icon.name))
    .slice(0, limit)
    .map(({ icon }) => icon);
}

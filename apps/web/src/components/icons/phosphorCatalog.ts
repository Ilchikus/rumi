import { useEffect, useState } from "react";

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

let catalogPromise: Promise<PhosphorCatalog> | null = null;
let loadedCatalog: PhosphorCatalog | null = null;

/** The full icon set is a separate chunk, loaded only when a picker or a `ph:` icon needs it. */
export function loadPhosphorCatalog(): Promise<PhosphorCatalog> {
  catalogPromise ??= import("./phosphor-catalog.generated.json").then((module) => {
    const generated = (module.default ?? module) as unknown as GeneratedPhosphorCatalog;
    const icons = generated.icons.map(([name, tags, path]) => ({ name, tags, path }));
    loadedCatalog = { icons, byName: new Map(icons.map((icon) => [icon.name, icon])) };
    return loadedCatalog;
  });
  return catalogPromise;
}

/** The catalog if it has already loaded, for synchronous renderers. */
export function peekPhosphorCatalog(): PhosphorCatalog | null {
  return loadedCatalog;
}

export function usePhosphorCatalog(enabled = true): PhosphorCatalog | null {
  const [catalog, setCatalog] = useState<PhosphorCatalog | null>(loadedCatalog);

  useEffect(() => {
    if (!enabled || catalog) return;
    let active = true;
    void loadPhosphorCatalog().then((loaded) => {
      if (active) setCatalog(loaded);
    }, () => undefined);
    return () => {
      active = false;
    };
  }, [catalog, enabled]);

  return catalog;
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

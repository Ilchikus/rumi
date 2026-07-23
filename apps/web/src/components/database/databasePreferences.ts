export const DEFAULT_DATABASE_NAME_COLUMN_WIDTH = 240;
export const DEFAULT_DATABASE_PROPERTY_COLUMN_WIDTH = 176;
export const MIN_DATABASE_COLUMN_WIDTH = 120;
export const MAX_DATABASE_COLUMN_WIDTH = 640;

export interface PreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
export type DatabaseColumnWidths = Record<string, number>;

export function databaseColumnWidth(
  widths: DatabaseColumnWidths,
  property: string
): number {
  return widths[property]
    ?? (property === "title"
      ? DEFAULT_DATABASE_NAME_COLUMN_WIDTH
      : DEFAULT_DATABASE_PROPERTY_COLUMN_WIDTH);
}

export function readDatabaseColumnWidths(
  storage: PreferenceStorage | null,
  workspaceKey: string,
  databasePath: string,
  viewName: string
): DatabaseColumnWidths {
  if (!storage) return {};

  try {
    const raw = storage.getItem(databaseColumnWidthsStorageKey(
      workspaceKey,
      databasePath,
      viewName
    ));
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, number] => (
          typeof entry[1] === "number" && Number.isFinite(entry[1])
        ))
        .map(([property, width]) => [property, clampDatabaseColumnWidth(width)])
    );
  } catch {
    return {};
  }
}

export function writeDatabaseColumnWidths(
  storage: PreferenceStorage | null,
  workspaceKey: string,
  databasePath: string,
  viewName: string,
  widths: DatabaseColumnWidths
): void {
  if (!storage) return;

  try {
    storage.setItem(
      databaseColumnWidthsStorageKey(workspaceKey, databasePath, viewName),
      JSON.stringify(widths)
    );
  } catch {
    // Browser preferences must never block database editing.
  }
}

export function clampDatabaseColumnWidth(width: number): number {
  return Math.min(Math.max(Math.round(width), MIN_DATABASE_COLUMN_WIDTH), MAX_DATABASE_COLUMN_WIDTH);
}

export function databaseColumnWidthsStorageKey(
  workspaceKey: string,
  databasePath: string,
  viewName: string
): string {
  return [
    "rumi-new-database-column-widths",
    workspaceKey,
    databasePath,
    viewName
  ].map(encodeURIComponent).join(":");
}

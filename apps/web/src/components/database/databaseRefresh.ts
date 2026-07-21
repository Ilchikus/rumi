export type DatabaseRefreshRevisions = Readonly<Record<string, number>>;

const ALL_DATABASES_KEY = "\0all-databases";

export function bumpDatabaseRefreshRevision(
  revisions: DatabaseRefreshRevisions,
  databasePath?: string
): DatabaseRefreshRevisions {
  const key = databasePath ?? ALL_DATABASES_KEY;
  return {
    ...revisions,
    [key]: (revisions[key] ?? 0) + 1
  };
}

export function databaseRefreshRevisionFor(
  revisions: DatabaseRefreshRevisions,
  databasePath: string
): number {
  return (revisions[ALL_DATABASES_KEY] ?? 0) + (revisions[databasePath] ?? 0);
}

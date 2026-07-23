import type { PageDocument } from "@rumi/contracts";

export function mergeRefreshedDatabaseContext(
  currentPage: PageDocument,
  refreshedPage: PageDocument
): PageDocument | null {
  if (
    currentPage.path !== refreshedPage.path
    || !currentPage.database
    || !refreshedPage.database
  ) {
    return null;
  }

  return {
    ...currentPage,
    database: refreshedPage.database
  };
}

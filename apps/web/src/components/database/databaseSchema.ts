import type {
  DatabasePropertyDefinition,
  DatabasePropertyType,
  DatabaseView
} from "@rumi/contracts";

export function databasePropertyDefinition(
  type: DatabasePropertyType
): DatabasePropertyDefinition {
  return type === "select" || type === "multi-select"
    ? { type, options: [] }
    : { type };
}

export function addDatabasePropertyToPrimaryView(
  views: DatabaseView[],
  property: string
): DatabaseView[] {
  return views.map((view, index) =>
    index === 0 && !view.columns.includes(property)
      ? { ...view, columns: [...view.columns, property] }
      : view
  );
}

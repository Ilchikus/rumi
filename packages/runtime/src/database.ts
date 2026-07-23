import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DatabaseFilterGroup,
  DatabaseFilterItem,
  DatabaseFilterRule,
  DatabasePropertyDefinition,
  DatabaseRecordPageConfig,
  DatabaseRecord,
  DatabaseSchema,
  DatabaseSort,
  DatabaseView,
  FrontmatterRecord,
  QueryDatabaseRequest,
  QueryDatabaseResult
} from "@rumi/contracts";
import { parseMarkdownFile } from "@rumi/markdown";
import {
  classifyFilePath,
  databaseConfigPathForDirectory,
  normalizeWorkspacePath
} from "@rumi/workspace-format";

export interface LoadedDatabaseConfig {
  databasePath: string;
  configPath: string;
  frontmatter: FrontmatterRecord;
  markdownBody: string;
  version: string;
  schema: DatabaseSchema;
}

export class DatabaseRequestError extends Error {
  readonly statusCode = 400;
}

export async function loadDatabaseConfig(
  rootPath: string,
  inputPath: string
): Promise<LoadedDatabaseConfig> {
  const databasePath = normalizeWorkspacePath(inputPath);
  const absoluteDatabasePath = resolveInsideRoot(rootPath, databasePath);
  const stat = await fs.stat(absoluteDatabasePath);

  if (!stat.isDirectory()) {
    throw new Error(`Database path must be a directory: ${databasePath}`);
  }

  const configPath = databaseConfigPathForDirectory(databasePath);
  const content = await fs.readFile(resolveInsideRoot(rootPath, configPath), "utf8");
  const parsed = parseMarkdownFile(content);

  return {
    databasePath,
    configPath,
    frontmatter: parsed.frontmatter,
    markdownBody: parsed.body,
    version: hashText(content),
    schema: databaseSchemaFromFrontmatter(parsed.frontmatter)
  };
}

export async function queryDatabaseFiles(
  rootPath: string,
  request: QueryDatabaseRequest
): Promise<QueryDatabaseResult> {
  const config = await loadDatabaseConfig(rootPath, request.databasePath);
  const entries = await fs.readdir(resolveInsideRoot(rootPath, config.databasePath), {
    withFileTypes: true
  });
  const recordPaths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => normalizeWorkspacePath(path.posix.join(config.databasePath, entry.name)))
    .filter((recordPath) => classifyFilePath(recordPath) === "page");
  const records = await Promise.all(
    recordPaths.map((recordPath) => readDatabaseRecord(rootPath, config.databasePath, recordPath))
  );
  return queryDatabaseRecords(config, records, request);
}

export function queryDatabaseRecords(
  config: LoadedDatabaseConfig,
  records: DatabaseRecord[],
  request: QueryDatabaseRequest
): QueryDatabaseResult {
  const view = request.viewId
    ? config.schema.views.find((candidate) => candidate.id === request.viewId)
    : undefined;
  if (request.viewId && !view) {
    throw new DatabaseRequestError(`Database view does not exist: ${request.viewId}`);
  }
  const savedFilters = view?.filters ?? [];
  const transientFilters = request.filters ?? [];
  const filtered =
    savedFilters.length === 0 && transientFilters.length === 0
      ? [...records]
      : records.filter((record) => (
          matchesFilterGroup(record, {
            filters: savedFilters,
            ...(view?.filterMode ? { filterMode: view.filterMode } : {})
          })
          && matchesFilterGroup(record, {
            filters: transientFilters,
            ...(request.filterMode ? { filterMode: request.filterMode } : {})
          })
        ));
  const sorts = request.sorts ?? view?.sorts ?? [];

  filtered.sort((left, right) => compareRecords(left, right, sorts));

  return {
    databasePath: config.databasePath,
    configPath: config.configPath,
    schema: config.schema,
    schemaVersion: config.version,
    records: filtered
  };
}

export async function readDatabaseRecord(
  rootPath: string,
  databasePath: string,
  recordPath: string
): Promise<DatabaseRecord> {
  const normalizedRecordPath = ensureDatabaseRecordPath(databasePath, recordPath);
  const content = await fs.readFile(resolveInsideRoot(rootPath, normalizedRecordPath), "utf8");
  const parsed = parseMarkdownFile(content);

  return {
    path: normalizedRecordPath,
    title: path.posix.basename(normalizedRecordPath, ".md"),
    frontmatter: parsed.frontmatter,
    version: hashText(content)
  };
}

export function ensureDatabaseRecordPath(databasePath: string, recordPath: string): string {
  const normalizedDatabasePath = normalizeWorkspacePath(databasePath);
  const normalizedRecordPath = normalizeWorkspacePath(recordPath);

  if (
    path.posix.dirname(normalizedRecordPath) !== normalizedDatabasePath ||
    classifyFilePath(normalizedRecordPath) !== "page"
  ) {
    throw new Error(`Record must be a Markdown page directly inside ${normalizedDatabasePath}`);
  }

  return normalizedRecordPath;
}

export function databaseSchemaFromFrontmatter(frontmatter: FrontmatterRecord): DatabaseSchema {
  const rawProperties = isRecord(frontmatter.properties) ? frontmatter.properties : {};
  const properties: Record<string, DatabasePropertyDefinition> = {};
  const unsupportedProperties: string[] = [];

  for (const [name, value] of Object.entries(rawProperties)) {
    const property = parsePropertyDefinition(value);

    if (property) {
      properties[name] = property;
    } else {
      unsupportedProperties.push(name);
    }
  }

  const rawViews = Array.isArray(frontmatter.views) ? frontmatter.views : [];
  const unsupportedViews: unknown[] = [];
  const usedViewIds = new Set<string>();
  const views = rawViews.flatMap((value, index) => {
    const view = parseView(value, Object.keys(properties), usedViewIds, index);
    if (view) return [view];
    unsupportedViews.push(value);
    return [];
  });
  const recordPage = parseRecordPage(frontmatter.recordPage);

  return {
    type: "database",
    properties,
    unsupportedProperties,
    unsupportedViews,
    recordPage,
    views:
      views.length > 0
        ? views
        : [
            {
              id: createDatabaseViewId([], "All"),
              name: "All",
              type: "table",
              columns: Object.keys(properties)
            }
          ]
  };
}

export function databaseFrontmatter(
  current: FrontmatterRecord,
  properties: Record<string, DatabasePropertyDefinition>,
  views: DatabaseView[],
  recordPage?: DatabaseRecordPageConfig
): FrontmatterRecord {
  const currentSchema = databaseSchemaFromFrontmatter(current);
  const currentProperties = isRecord(current.properties) ? current.properties : {};
  const supportedPropertyNames = new Set(Object.keys(currentSchema.properties));
  const preservedUnsupportedProperties = Object.fromEntries(
    Object.entries(currentProperties).filter(([name]) => !supportedPropertyNames.has(name))
  );

  return {
    ...current,
    type: "database",
    properties: {
      ...properties,
      ...preservedUnsupportedProperties
    },
    recordPage: recordPage ?? currentSchema.recordPage,
    views: [
      ...views.map((view) => {
        const { filters: _filters, filterMode: _filterMode, ...viewWithoutFilters } = view;
        const filters = normalizeDatabaseFilters(view.filters ?? []);
        return filters.length > 0
          ? {
              ...viewWithoutFilters,
              filters,
              ...(view.filterMode === "or" ? { filterMode: "or" as const } : {})
            }
          : viewWithoutFilters;
      }),
      ...currentSchema.unsupportedViews
    ]
  };
}

function parsePropertyDefinition(value: unknown): DatabasePropertyDefinition | null {
  if (!isRecord(value) || !isDatabasePropertyType(value.type)) {
    return null;
  }

  if (value.type !== "select" && value.type !== "multi-select") {
    return { type: value.type };
  }

  const options = Array.isArray(value.options)
    ? value.options.flatMap((option) => {
        if (typeof option === "string") {
          return [{ name: option }];
        }

        if (!isRecord(option) || typeof option.name !== "string") {
          return [];
        }

        return [
          {
            name: option.name,
            ...(typeof option.color === "string" ? { color: option.color } : {})
          }
        ];
      })
    : [];

  return {
    type: value.type,
    options
  };
}

function parseView(
  value: unknown,
  fallbackColumns: string[],
  usedViewIds: Set<string>,
  index: number
): DatabaseView | null {
  if (!isRecord(value) || value.type !== "table") {
    return null;
  }

  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : "Table";
  const requestedId = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
  const id = uniqueDatabaseViewId(
    usedViewIds,
    requestedId || databaseViewIdBase(name) || `view-${index + 1}`
  );
  usedViewIds.add(id);
  const columns = Array.isArray(value.columns)
    ? value.columns.filter((column): column is string => typeof column === "string")
    : fallbackColumns;
  const filters = Array.isArray(value.filters)
    ? value.filters.flatMap((filter) => {
        const parsed = parseDatabaseFilterItem(filter);
        return parsed ? [parsed] : [];
      })
    : undefined;
  const sorts = Array.isArray(value.sorts)
    ? value.sorts.filter(isDatabaseSort)
    : undefined;

  return {
    id,
    name,
    type: "table",
    columns,
    ...(filters && filters.length > 0 ? { filters } : {}),
    ...(value.filterMode === "or" ? { filterMode: "or" } : {}),
    ...(sorts && sorts.length > 0 ? { sorts } : {})
  };
}

function parseRecordPage(value: unknown): DatabaseRecordPageConfig {
  if (!isRecord(value) || !Array.isArray(value.hiddenProperties)) {
    return { hiddenProperties: [] };
  }

  return {
    hiddenProperties: [...new Set(
      value.hiddenProperties.filter((property): property is string => (
        typeof property === "string" && property.trim().length > 0
      ))
    )]
  };
}

function isDatabasePropertyType(value: unknown): value is DatabasePropertyDefinition["type"] {
  return (
    value === "text" ||
    value === "number" ||
    value === "date" ||
    value === "checkbox" ||
    value === "select" ||
    value === "multi-select"
  );
}

function parseDatabaseFilterItem(value: unknown): DatabaseFilterItem | null {
  if (!isRecord(value)) return null;

  if (Array.isArray(value.filters)) {
    const filters = value.filters.flatMap((filter) => {
      const parsed = parseDatabaseFilterItem(filter);
      return parsed ? [parsed] : [];
    });
    if (filters.length === 0) return null;
    return {
      filters,
      ...(value.filterMode === "or" ? { filterMode: "or" as const } : {})
    };
  }

  if (
    typeof value.property !== "string" ||
    typeof value.operator !== "string" ||
    ![
      "equals",
      "not-equals",
      "contains",
      "not-contains",
      "is-empty",
      "is-not-empty",
      "greater-than",
      "less-than"
    ].includes(value.operator)
  ) {
    return null;
  }

  return {
    property: value.property,
    operator: value.operator as DatabaseFilterRule["operator"],
    ...(Object.prototype.hasOwnProperty.call(value, "value") ? { value: value.value } : {})
  };
}

function isDatabaseSort(value: unknown): value is DatabaseSort {
  return (
    isRecord(value) &&
    typeof value.property === "string" &&
    (value.direction === "asc" || value.direction === "desc")
  );
}

function matchesFilterGroup(record: DatabaseRecord, group: DatabaseFilterGroup): boolean {
  if (group.filters.length === 0) return true;
  return (group.filterMode ?? "and") === "and"
    ? group.filters.every((filter) => matchesFilterItem(record, filter))
    : group.filters.some((filter) => matchesFilterItem(record, filter));
}

function matchesFilterItem(record: DatabaseRecord, filter: DatabaseFilterItem): boolean {
  return isDatabaseFilterGroup(filter)
    ? matchesFilterGroup(record, filter)
    : matchesFilterRule(record, filter);
}

function matchesFilterRule(record: DatabaseRecord, filter: DatabaseFilterRule): boolean {
  const value = filter.property === "title" ? record.title : record.frontmatter[filter.property];
  const expected = filter.value;

  switch (filter.operator) {
    case "equals":
      return valuesEqual(value, expected);
    case "not-equals":
      return !valuesEqual(value, expected);
    case "contains":
      return containsValue(value, expected);
    case "not-contains":
      return !containsValue(value, expected);
    case "is-empty":
      return isEmptyValue(value);
    case "is-not-empty":
      return !isEmptyValue(value);
    case "greater-than":
      return compareValues(value, expected) > 0;
    case "less-than":
      return compareValues(value, expected) < 0;
  }
}

function compareRecords(left: DatabaseRecord, right: DatabaseRecord, sorts: DatabaseSort[]): number {
  for (const sort of sorts) {
    const leftValue = sort.property === "title" ? left.title : left.frontmatter[sort.property];
    const rightValue = sort.property === "title" ? right.title : right.frontmatter[sort.property];
    const comparison = compareValues(leftValue, rightValue);

    if (comparison !== 0) {
      return sort.direction === "desc" ? -comparison : comparison;
    }
  }

  return left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" });
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return displayValue(left).localeCompare(displayValue(right), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left)) {
    if (Array.isArray(right)) {
      return unorderedValuesEqual(left, right);
    }
    return left.some((item) => valuesEqual(item, right));
  }

  if (Array.isArray(right)) {
    return false;
  }

  if (typeof left === "string" && typeof right === "string") {
    return left.toLocaleLowerCase() === right.toLocaleLowerCase();
  }

  return displayValue(left) === displayValue(right);
}

function containsValue(value: unknown, expected: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => valuesEqual(item, expected));
  }

  return displayValue(value).toLocaleLowerCase().includes(displayValue(expected).toLocaleLowerCase());
}

function unorderedValuesEqual(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) return false;
  const unmatched = [...right];
  for (const value of left) {
    const index = unmatched.findIndex((candidate) => valuesEqual(value, candidate));
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }
  return unmatched.length === 0;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  return typeof value === "string" ? value : String(value);
}

function resolveInsideRoot(rootPath: string, relPath: string): string {
  const resolvedRoot = path.resolve(rootPath);
  const resolved = path.resolve(resolvedRoot, normalizeWorkspacePath(relPath));
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;

  if (resolved !== resolvedRoot && !resolved.startsWith(prefix)) {
    throw new Error(`Workspace path escapes root: ${relPath}`);
  }

  return resolved;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDatabaseFilterGroup(
  filter: DatabaseFilterItem
): filter is DatabaseFilterGroup {
  return "filters" in filter;
}

export function mapDatabaseFilterRules(
  filters: readonly DatabaseFilterItem[],
  mapRule: (rule: DatabaseFilterRule) => DatabaseFilterRule | null
): DatabaseFilterItem[] {
  const mappedFilters: DatabaseFilterItem[] = [];
  for (const filter of filters) {
    if (!isDatabaseFilterGroup(filter)) {
      const mapped = mapRule(filter);
      if (mapped) mappedFilters.push(mapped);
      continue;
    }

    const nested = mapDatabaseFilterRules(filter.filters, mapRule);
    if (nested.length > 0) {
      mappedFilters.push({ ...filter, filters: nested });
    }
  }
  return mappedFilters;
}

export function normalizeDatabaseFilters(
  filters: readonly DatabaseFilterItem[]
): DatabaseFilterItem[] {
  const normalized: DatabaseFilterItem[] = [];
  for (const filter of filters) {
    if (isDatabaseFilterGroup(filter)) {
      const nested = normalizeDatabaseFilters(filter.filters);
      if (nested.length > 0) {
        normalized.push({
          filters: nested,
          ...(filter.filterMode === "or" ? { filterMode: "or" as const } : {})
        });
      }
      continue;
    }

    if (filter.operator === "is-empty" || filter.operator === "is-not-empty") {
      normalized.push({ property: filter.property, operator: filter.operator });
      continue;
    }
    normalized.push({ ...filter });
  }
  return normalized;
}

export function createDatabaseViewId(
  views: readonly DatabaseView[],
  name: string
): string {
  const used = new Set(views.map((view) => view.id));
  return uniqueDatabaseViewId(used, databaseViewIdBase(name) || "view");
}

function databaseViewIdBase(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function uniqueDatabaseViewId(used: Set<string>, requested: string): string {
  const base = requested || "view";
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

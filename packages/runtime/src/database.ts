import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DatabaseFilter,
  DatabasePropertyDefinition,
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
  const filters = request.filters ?? [];
  const filtered =
    filters.length === 0
      ? records
      : records.filter((record) =>
          (request.filterMode ?? "and") === "and"
            ? filters.every((filter) => matchesFilter(record, filter))
            : filters.some((filter) => matchesFilter(record, filter))
        );
  const sorts = request.sorts ?? [];

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
  const views = rawViews.flatMap((value) => {
    const view = parseView(value, Object.keys(properties));
    return view ? [view] : [];
  });

  return {
    type: "database",
    properties,
    unsupportedProperties,
    views:
      views.length > 0
        ? views
        : [
            {
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
  views: DatabaseView[]
): FrontmatterRecord {
  const currentProperties = isRecord(current.properties) ? current.properties : {};
  const supportedPropertyNames = new Set(Object.keys(databaseSchemaFromFrontmatter(current).properties));
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
    views
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

function parseView(value: unknown, fallbackColumns: string[]): DatabaseView | null {
  if (!isRecord(value) || value.type !== "table") {
    return null;
  }

  const columns = Array.isArray(value.columns)
    ? value.columns.filter((column): column is string => typeof column === "string")
    : fallbackColumns;
  const filters = Array.isArray(value.filters)
    ? value.filters.filter(isDatabaseFilter)
    : undefined;
  const sorts = Array.isArray(value.sorts)
    ? value.sorts.filter(isDatabaseSort)
    : undefined;

  return {
    name: typeof value.name === "string" && value.name.trim() ? value.name : "Table",
    type: "table",
    columns,
    ...(filters && filters.length > 0 ? { filters } : {}),
    ...(value.filterMode === "or" ? { filterMode: "or" } : {}),
    ...(sorts && sorts.length > 0 ? { sorts } : {})
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

function isDatabaseFilter(value: unknown): value is DatabaseFilter {
  return (
    isRecord(value) &&
    typeof value.property === "string" &&
    typeof value.operator === "string" &&
    [
      "equals",
      "not-equals",
      "contains",
      "not-contains",
      "is-empty",
      "is-not-empty",
      "greater-than",
      "less-than"
    ].includes(value.operator)
  );
}

function isDatabaseSort(value: unknown): value is DatabaseSort {
  return (
    isRecord(value) &&
    typeof value.property === "string" &&
    (value.direction === "asc" || value.direction === "desc")
  );
}

function matchesFilter(record: DatabaseRecord, filter: DatabaseFilter): boolean {
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
    return left.some((item) => valuesEqual(item, right));
  }

  return displayValue(left) === displayValue(right);
}

function containsValue(value: unknown, expected: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsValue(item, expected));
  }

  return displayValue(value).toLocaleLowerCase().includes(displayValue(expected).toLocaleLowerCase());
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

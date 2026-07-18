import type { PageDocumentKind } from "@rumi/contracts";

export function pageTitleFromPath(path: string, kind: PageDocumentKind): string {
  const filename = path.split("/").at(-1) ?? path;

  if (kind === "folder" && filename.endsWith(".index.md")) {
    return filename.slice(0, -".index.md".length);
  }

  if (kind === "database" && filename.endsWith(".db.md")) {
    return filename.slice(0, -".db.md".length);
  }

  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}

export function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Empty";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(formatNestedPropertyValue).join(", ");
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatNestedPropertyValue(value: unknown): string {
  return value === null || value === undefined ? "" : formatPropertyValue(value);
}

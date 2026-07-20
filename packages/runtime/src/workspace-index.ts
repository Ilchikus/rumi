import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DatabaseRecord,
  FrontmatterRecord,
  PageDocumentKind,
  SearchWorkspaceRequest,
  SearchWorkspaceResult,
  SearchWorkspaceResultItem
} from "@rumi/contracts";
import { parseMarkdownFile } from "@rumi/markdown";
import {
  classifyFilePath,
  isHiddenFromTree,
  normalizeWorkspacePath,
  type WorkspaceFileKind
} from "@rumi/workspace-format";

interface IndexedDocumentRow {
  path: string;
  kind: PageDocumentKind;
  title: string;
  parent_path: string;
  frontmatter_json: string;
  body: string;
  content_hash: string;
  modified_at: number;
}

interface PersistedWorkspaceIndex {
  format: 1;
  builtAt: string | null;
  documents: IndexedDocumentRow[];
}

export class WorkspaceIndex {
  private readonly rootPath: string;
  private readonly storagePath: string;
  private readonly documents: Map<string, IndexedDocumentRow>;
  private builtAt: string | null;
  private buildPromise: Promise<number> | null = null;
  private persistPromise: Promise<void> = Promise.resolve();

  private constructor(
    rootPath: string,
    storagePath: string,
    persisted: PersistedWorkspaceIndex | null
  ) {
    this.rootPath = rootPath;
    this.storagePath = storagePath;
    this.documents = new Map(
      (persisted?.documents ?? []).map((document) => [document.path, document])
    );
    this.builtAt = persisted?.builtAt ?? null;
  }

  static async open(rootPath: string): Promise<WorkspaceIndex> {
    const resolvedRoot = path.resolve(rootPath);
    const internalPath = path.join(resolvedRoot, ".rumi");
    await fs.mkdir(internalPath, { recursive: true });
    const indexPath = path.join(internalPath, "index.json");
    const persisted = await readPersistedIndex(indexPath);
    const workspaceIndex = new WorkspaceIndex(resolvedRoot, indexPath, persisted);
    if (!persisted) {
      await workspaceIndex.persist();
    }
    return workspaceIndex;
  }

  async ensureBuilt(): Promise<number> {
    return this.builtAt ? this.documentCount() : this.rebuild();
  }

  async rebuild(): Promise<number> {
    if (this.buildPromise) {
      return this.buildPromise;
    }

    this.buildPromise = this.rebuildNow().finally(() => {
      this.buildPromise = null;
    });
    return this.buildPromise;
  }

  async indexPath(inputPath: string): Promise<void> {
    const relPath = normalizeWorkspacePath(inputPath);
    const absolutePath = this.resolveAbsolutePath(relPath);
    const stat = await fs.stat(absolutePath).catch((error: unknown) => {
      if (isMissingPathError(error)) {
        return null;
      }
      throw error;
    });

    if (!stat) {
      await this.removePath(relPath);
      return;
    }

    if (stat.isDirectory()) {
      const files = await collectMarkdownFiles(this.rootPath, relPath);
      const rows = await readRows(this.rootPath, files);
      this.writeRows(rows);
      await this.persist();
      return;
    }

    const row = await readRow(this.rootPath, relPath);

    if (row) {
      this.writeRows([row]);
      await this.persist();
    }
  }

  async removePath(inputPath: string): Promise<void> {
    const relPath = normalizeWorkspacePath(inputPath);
    const descendantPrefix = relPath ? `${relPath}/` : "";

    for (const documentPath of this.documents.keys()) {
      if (
        documentPath === relPath ||
        (descendantPrefix && documentPath.startsWith(descendantPrefix))
      ) {
        this.documents.delete(documentPath);
      }
    }

    await this.persist();
  }

  async movePath(previousPath: string, nextPath: string): Promise<void> {
    await this.removePath(previousPath);
    await this.indexPath(nextPath);
  }

  async search(request: SearchWorkspaceRequest): Promise<SearchWorkspaceResult> {
    await this.ensureBuilt();
    const query = request.query.trim();

    if (!query) {
      return { query, items: [] };
    }

    const normalized = query.toLocaleLowerCase();
    const requestedKinds = (request.kinds ?? []).filter(
      (kind): kind is PageDocumentKind => kind === "page" || kind === "folder" || kind === "database"
    );
    const requestedKindSet = new Set(requestedKinds);
    const limit = Math.min(Math.max(request.limit ?? 50, 1), 200);
    const rows = [...this.documents.values()]
      .filter((row) => requestedKindSet.size === 0 || requestedKindSet.has(row.kind))
      .map((row) => ({ ...row, score: searchScore(row, normalized) }))
      .filter((row) => row.score !== null)
      .sort((left, right) =>
        left.score! - right.score! ||
        left.title.length - right.title.length ||
        compareTitles(left.title, right.title) ||
        left.path.localeCompare(right.path)
      )
      .slice(0, limit) as Array<IndexedDocumentRow & { score: number }>;
    const items: SearchWorkspaceResultItem[] = rows.map((row) => ({
      path: row.path,
      title: row.title,
      kind: row.kind,
      snippet: matchingSnippet(row.body, query),
      score: row.score
    }));
    return { query, items };
  }

  async databaseRecords(databasePath: string): Promise<DatabaseRecord[]> {
    await this.ensureBuilt();
    const normalized = normalizeWorkspacePath(databasePath);
    const rows = [...this.documents.values()]
      .filter((row) => row.parent_path === normalized && row.kind === "page")
      .sort((left, right) => compareTitles(left.title, right.title) || left.path.localeCompare(right.path));

    return rows.map((row) => ({
      path: row.path,
      title: row.title,
      frontmatter: JSON.parse(row.frontmatter_json) as FrontmatterRecord,
      version: row.content_hash
    }));
  }

  documentCount(): number {
    return this.documents.size;
  }

  close(): void {
    // Every mutation is persisted before it resolves, so there is no native handle to close.
  }

  private async rebuildNow(): Promise<number> {
    const files = await collectMarkdownFiles(this.rootPath, "");
    this.documents.clear();

    for (let offset = 0; offset < files.length; offset += 32) {
      const rows = await readRows(this.rootPath, files.slice(offset, offset + 32));
      this.writeRows(rows);
    }

    this.builtAt = new Date().toISOString();
    await this.persist();
    return this.documentCount();
  }

  private writeRows(rows: IndexedDocumentRow[]): void {
    for (const row of rows) {
      this.documents.set(row.path, row);
    }
  }

  private async persist(): Promise<void> {
    const payload: PersistedWorkspaceIndex = {
      format: 1,
      builtAt: this.builtAt,
      documents: [...this.documents.values()].sort((left, right) => left.path.localeCompare(right.path))
    };
    const serialized = `${JSON.stringify(payload)}\n`;
    const temporaryPath = `${this.storagePath}.${process.pid}.tmp`;
    const scheduled = this.persistPromise.then(async () => {
      await fs.writeFile(temporaryPath, serialized, "utf8");
      await fs.rename(temporaryPath, this.storagePath);
    });
    this.persistPromise = scheduled.catch(() => undefined);
    await scheduled;
  }

  private resolveAbsolutePath(relPath: string): string {
    const resolved = path.resolve(this.rootPath, normalizeWorkspacePath(relPath));
    const prefix = this.rootPath.endsWith(path.sep) ? this.rootPath : `${this.rootPath}${path.sep}`;

    if (resolved !== this.rootPath && !resolved.startsWith(prefix)) {
      throw new Error(`Workspace path escapes root: ${relPath}`);
    }

    return resolved;
  }
}

async function collectMarkdownFiles(rootPath: string, startPath: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (relPath: string): Promise<void> => {
    const entries = await fs.readdir(path.join(rootPath, relPath), { withFileTypes: true });

    for (const entry of entries) {
      const childPath = normalizeWorkspacePath(path.posix.join(relPath, entry.name));

      if (isHiddenFromTree(childPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(childPath);
      } else if (entry.isFile() && isIndexedKind(classifyFilePath(childPath))) {
        files.push(childPath);
      }
    }
  };

  const normalized = normalizeWorkspacePath(startPath);
  const stat = await fs.stat(path.join(rootPath, normalized));

  if (stat.isDirectory()) {
    await visit(normalized);
  } else if (isIndexedKind(classifyFilePath(normalized))) {
    files.push(normalized);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function readRows(rootPath: string, paths: string[]): Promise<IndexedDocumentRow[]> {
  const rows = await Promise.all(paths.map((relPath) => readRow(rootPath, relPath)));
  return rows.filter((row): row is IndexedDocumentRow => row !== null);
}

async function readPersistedIndex(indexPath: string): Promise<PersistedWorkspaceIndex | null> {
  const serialized = await fs.readFile(indexPath, "utf8").catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return null;
    }
    throw error;
  });

  if (serialized === null) {
    return null;
  }

  try {
    const value = JSON.parse(serialized) as unknown;
    return isPersistedWorkspaceIndex(value) ? value : null;
  } catch {
    return null;
  }
}

async function readRow(rootPath: string, relPath: string): Promise<IndexedDocumentRow | null> {
  const kind = classifyFilePath(relPath);

  if (!isIndexedKind(kind)) {
    return null;
  }

  const absolutePath = path.join(rootPath, relPath);
  const [content, stat] = await Promise.all([
    fs.readFile(absolutePath, "utf8"),
    fs.stat(absolutePath)
  ]);
  const parsed = parseMarkdownFile(content);

  return {
    path: relPath,
    kind: documentKind(kind),
    title: titleForPath(relPath, kind),
    parent_path: parentPath(relPath),
    frontmatter_json: JSON.stringify(parsed.frontmatter),
    body: parsed.body,
    content_hash: hashText(content),
    modified_at: Math.round(stat.mtimeMs)
  };
}

function isIndexedKind(kind: WorkspaceFileKind): boolean {
  return kind === "page" || kind === "folder-index" || kind === "database-config";
}

function documentKind(kind: WorkspaceFileKind): PageDocumentKind {
  return kind === "folder-index" ? "folder" : kind === "database-config" ? "database" : "page";
}

function titleForPath(relPath: string, kind: WorkspaceFileKind): string {
  if (kind === "folder-index" || kind === "database-config") {
    return path.posix.basename(path.posix.dirname(relPath));
  }

  return path.posix.basename(relPath, ".md");
}

function parentPath(relPath: string): string {
  const parent = path.posix.dirname(relPath);
  return parent === "." ? "" : parent;
}

function matchingSnippet(body: string, query: string): string {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  const matchIndex = normalizedBody.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, matchIndex < 0 ? 0 : matchIndex - 55);
  const snippet = normalizedBody.slice(start, start + 170);
  return `${start > 0 ? "…" : ""}${snippet}${start + 170 < normalizedBody.length ? "…" : ""}`;
}

function searchScore(row: IndexedDocumentRow, query: string): number | null {
  const title = row.title.toLocaleLowerCase();
  const documentPath = row.path.toLocaleLowerCase();
  const frontmatter = row.frontmatter_json.toLocaleLowerCase();
  const body = row.body.toLocaleLowerCase();

  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (documentPath.startsWith(query)) return 2;
  if (title.includes(query)) return 3;
  if (documentPath.includes(query)) return 4;
  if (frontmatter.includes(query)) return 5;
  if (body.includes(query)) return 6;
  return null;
}

function compareTitles(left: string, right: string): number {
  return left.toLocaleLowerCase().localeCompare(right.toLocaleLowerCase()) || left.localeCompare(right);
}

function isPersistedWorkspaceIndex(value: unknown): value is PersistedWorkspaceIndex {
  if (!isRecord(value) || value.format !== 1 || !Array.isArray(value.documents)) {
    return false;
  }

  if (value.builtAt !== null && typeof value.builtAt !== "string") {
    return false;
  }

  return value.documents.every(isIndexedDocumentRow);
}

function isIndexedDocumentRow(value: unknown): value is IndexedDocumentRow {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    (value.kind === "page" || value.kind === "folder" || value.kind === "database") &&
    typeof value.title === "string" &&
    typeof value.parent_path === "string" &&
    typeof value.frontmatter_json === "string" &&
    typeof value.body === "string" &&
    typeof value.content_hash === "string" &&
    typeof value.modified_at === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

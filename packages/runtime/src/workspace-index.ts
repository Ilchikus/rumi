import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
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

interface CountRow {
  count: number;
}

export class WorkspaceIndex {
  private readonly rootPath: string;
  private readonly database: Database.Database;
  private buildPromise: Promise<number> | null = null;

  private constructor(rootPath: string, database: Database.Database) {
    this.rootPath = rootPath;
    this.database = database;
    this.initializeSchema();
  }

  static async open(rootPath: string): Promise<WorkspaceIndex> {
    const resolvedRoot = path.resolve(rootPath);
    const internalPath = path.join(resolvedRoot, ".rumi");
    await fs.mkdir(internalPath, { recursive: true });
    const database = new Database(path.join(internalPath, "index.sqlite"));
    return new WorkspaceIndex(resolvedRoot, database);
  }

  async ensureBuilt(): Promise<number> {
    const marker = this.database
      .prepare("SELECT value FROM metadata WHERE key = 'last_rebuild'")
      .get() as { value: string } | undefined;

    return marker ? this.documentCount() : this.rebuild();
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
      this.removePath(relPath);
      return;
    }

    if (stat.isDirectory()) {
      const files = await collectMarkdownFiles(this.rootPath, relPath);
      const rows = await readRows(this.rootPath, files);
      this.writeRows(rows);
      return;
    }

    const row = await readRow(this.rootPath, relPath);

    if (row) {
      this.writeRows([row]);
    }
  }

  removePath(inputPath: string): void {
    const relPath = normalizeWorkspacePath(inputPath);
    const pattern = `${escapeLike(relPath)}/%`;
    const paths = this.database
      .prepare("SELECT path FROM documents WHERE path = ? OR path LIKE ? ESCAPE '\\'")
      .all(relPath, pattern) as Array<{ path: string }>;
    const removeDocument = this.database.prepare("DELETE FROM documents WHERE path = ?");
    const removeSearch = this.database.prepare("DELETE FROM documents_fts WHERE path = ?");
    const transaction = this.database.transaction(() => {
      for (const row of paths) {
        removeSearch.run(row.path);
        removeDocument.run(row.path);
      }
    });
    transaction();
  }

  async movePath(previousPath: string, nextPath: string): Promise<void> {
    this.removePath(previousPath);
    await this.indexPath(nextPath);
  }

  async search(request: SearchWorkspaceRequest): Promise<SearchWorkspaceResult> {
    await this.ensureBuilt();
    const query = request.query.trim();

    if (!query) {
      return { query, items: [] };
    }

    const normalized = query.toLocaleLowerCase();
    const contains = `%${escapeLike(normalized)}%`;
    const prefix = `${escapeLike(normalized)}%`;
    const exact = normalized;
    const requestedKinds = (request.kinds ?? []).filter(
      (kind): kind is PageDocumentKind => kind === "page" || kind === "folder" || kind === "database"
    );
    const kindClause = requestedKinds.length > 0
      ? `AND kind IN (${requestedKinds.map(() => "?").join(", ")})`
      : "";
    const limit = Math.min(Math.max(request.limit ?? 50, 1), 200);
    const rows = this.database
      .prepare(`
        SELECT path, kind, title, body,
          CASE
            WHEN lower(title) = ? THEN 0
            WHEN lower(title) LIKE ? ESCAPE '\\' THEN 1
            WHEN lower(path) LIKE ? ESCAPE '\\' THEN 2
            WHEN lower(title) LIKE ? ESCAPE '\\' THEN 3
            WHEN lower(path) LIKE ? ESCAPE '\\' THEN 4
            WHEN lower(frontmatter_json) LIKE ? ESCAPE '\\' THEN 5
            ELSE 6
          END AS score
        FROM documents
        WHERE (
          lower(title) LIKE ? ESCAPE '\\'
          OR lower(path) LIKE ? ESCAPE '\\'
          OR lower(frontmatter_json) LIKE ? ESCAPE '\\'
          OR lower(body) LIKE ? ESCAPE '\\'
        )
        ${kindClause}
        ORDER BY score ASC, length(title) ASC, title COLLATE NOCASE ASC
        LIMIT ?
      `)
      .all(
        exact,
        prefix,
        prefix,
        contains,
        contains,
        contains,
        contains,
        contains,
        contains,
        contains,
        ...requestedKinds,
        limit
      ) as Array<{
        path: string;
        kind: PageDocumentKind;
        title: string;
        body: string;
        score: number;
      }>;
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
    const rows = this.database
      .prepare(`
        SELECT path, title, frontmatter_json, content_hash
        FROM documents
        WHERE parent_path = ? AND kind = 'page'
        ORDER BY title COLLATE NOCASE ASC
      `)
      .all(normalized) as Array<{
        path: string;
        title: string;
        frontmatter_json: string;
        content_hash: string;
      }>;

    return rows.map((row) => ({
      path: row.path,
      title: row.title,
      frontmatter: JSON.parse(row.frontmatter_json) as FrontmatterRecord,
      version: row.content_hash
    }));
  }

  documentCount(): number {
    const row = this.database.prepare("SELECT count(*) AS count FROM documents").get() as CountRow;
    return row.count;
  }

  close(): void {
    this.database.close();
  }

  private initializeSchema(): void {
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("synchronous = NORMAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS documents (
        path TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        parent_path TEXT NOT NULL,
        frontmatter_json TEXT NOT NULL,
        body TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        modified_at INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS documents_parent_path_idx ON documents(parent_path);
      CREATE INDEX IF NOT EXISTS documents_kind_idx ON documents(kind);

      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        path UNINDEXED,
        title,
        frontmatter,
        body,
        tokenize = 'unicode61'
      );
    `);
  }

  private async rebuildNow(): Promise<number> {
    const files = await collectMarkdownFiles(this.rootPath, "");
    const clear = this.database.transaction(() => {
      this.database.prepare("DELETE FROM documents_fts").run();
      this.database.prepare("DELETE FROM documents").run();
    });
    clear();

    for (let offset = 0; offset < files.length; offset += 32) {
      const rows = await readRows(this.rootPath, files.slice(offset, offset + 32));
      this.writeRows(rows);
    }

    this.database
      .prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('last_rebuild', ?)")
      .run(new Date().toISOString());
    return this.documentCount();
  }

  private writeRows(rows: IndexedDocumentRow[]): void {
    const upsert = this.database.prepare(`
      INSERT INTO documents(path, kind, title, parent_path, frontmatter_json, body, content_hash, modified_at)
      VALUES (@path, @kind, @title, @parent_path, @frontmatter_json, @body, @content_hash, @modified_at)
      ON CONFLICT(path) DO UPDATE SET
        kind = excluded.kind,
        title = excluded.title,
        parent_path = excluded.parent_path,
        frontmatter_json = excluded.frontmatter_json,
        body = excluded.body,
        content_hash = excluded.content_hash,
        modified_at = excluded.modified_at
    `);
    const removeSearch = this.database.prepare("DELETE FROM documents_fts WHERE path = ?");
    const insertSearch = this.database.prepare(
      "INSERT INTO documents_fts(path, title, frontmatter, body) VALUES (?, ?, ?, ?)"
    );
    const transaction = this.database.transaction(() => {
      for (const row of rows) {
        upsert.run(row);
        removeSearch.run(row.path);
        insertSearch.run(row.path, row.title, row.frontmatter_json, row.body);
      }
    });
    transaction();
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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

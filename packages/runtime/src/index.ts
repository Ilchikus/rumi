import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  CreateFolderRequest,
  CreatePageRequest,
  DeleteNodeRequest,
  FrontmatterRecord,
  MoveNodeRequest,
  OpenWorkspaceResult,
  PageDocument,
  PageDocumentKind,
  RenameNodeRequest,
  RumiEvent,
  RumiEventEnvelope,
  SavePageRequest,
  SavePageResult,
  WorkspaceNode,
  WorkspaceNodeKind,
  WorkspaceMutationResult
} from "@rumi/contracts";
import { parseMarkdownFile, serializeMarkdownFile } from "@rumi/markdown";
import {
  classifyFilePath,
  cleanWorkspaceName,
  databaseConfigPathForDirectory,
  folderIndexPathForDirectory,
  isHiddenFromTree,
  normalizeWorkspacePath
} from "@rumi/workspace-format";
import { WorkspaceWatcher, type WorkspaceReconcileResult } from "./watcher";

export interface WorkspaceRuntimeOptions {
  rootPath: string;
}

export type RumiEventSubscriber = (envelope: RumiEventEnvelope) => void;

export class RuntimeEventBus {
  private nextId = 1;
  private readonly subscribers = new Set<RumiEventSubscriber>();

  subscribe(subscriber: RumiEventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  publish(event: RumiEvent): RumiEventEnvelope {
    const envelope: RumiEventEnvelope = {
      id: this.nextId,
      emittedAt: new Date().toISOString(),
      event
    };
    this.nextId += 1;

    for (const subscriber of this.subscribers) {
      try {
        subscriber(envelope);
      } catch {
        // Event observers must not make a completed workspace command fail.
      }
    }

    return envelope;
  }
}

export class WorkspaceRuntime {
  readonly rootPath: string;
  readonly name: string;
  readonly events = new RuntimeEventBus();
  private workspaceWatcher: WorkspaceWatcher | null = null;

  private constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.name = path.basename(rootPath);
  }

  static async open(options: WorkspaceRuntimeOptions): Promise<WorkspaceRuntime> {
    const rootPath = path.resolve(options.rootPath);
    const stat = await fs.stat(rootPath).catch(() => null);

    if (!stat) {
      throw new Error(`Workspace root does not exist: ${rootPath}`);
    }

    if (!stat.isDirectory()) {
      throw new Error(`Workspace root must be a directory: ${rootPath}`);
    }

    return new WorkspaceRuntime(rootPath);
  }

  info(): OpenWorkspaceResult {
    return {
      rootPath: this.rootPath,
      name: this.name
    };
  }

  async getTree(): Promise<WorkspaceNode> {
    return this.readDirectoryTree("");
  }

  async openPage(inputPath: string): Promise<PageDocument> {
    const target = await this.resolvePageTarget(inputPath);
    const absolutePath = this.resolveAbsolutePath(target.path);
    const content = await fs.readFile(absolutePath, "utf8");
    const parsed = parseMarkdownFile(content);

    return {
      path: target.path,
      kind: target.kind,
      frontmatter: parsed.frontmatter,
      markdownBody: parsed.body,
      contentHash: hashText(content),
      frontmatterHash: hashJson(parsed.frontmatter),
      version: hashText(content)
    };
  }

  async savePage(request: SavePageRequest): Promise<SavePageResult> {
    const relPath = normalizeWorkspacePath(request.path);
    const absolutePath = this.resolveAbsolutePath(relPath);
    const currentContent = await fs.readFile(absolutePath, "utf8").catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
    const currentVersion = currentContent === null ? null : hashText(currentContent);

    if (request.baseVersion && currentVersion && request.baseVersion !== currentVersion) {
      return {
        status: "conflict",
        path: relPath,
        currentVersion,
        attemptedBaseVersion: request.baseVersion
      };
    }

    const nextContent = serializeMarkdownFile(request.frontmatter, request.markdownBody);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, nextContent, "utf8");

    const nextHash = hashText(nextContent);

    const event: RumiEvent = {
      name: "page.changed",
      path: relPath,
      version: nextHash,
      contentHash: nextHash,
      changedBy: request.reason,
      affects: ["frontmatter", "body"]
    };
    this.events.publish(event);

    return {
      status: "saved",
      path: relPath,
      version: nextHash,
      contentHash: nextHash,
      changedIndexes: [],
      events: [event]
    };
  }

  async createPage(request: CreatePageRequest): Promise<WorkspaceMutationResult> {
    const parentPath = normalizeWorkspacePath(request.parentPath);
    const pageName = ensureMarkdownName(cleanWorkspaceName(request.name));
    const relPath = normalizeWorkspacePath(path.posix.join(parentPath, pageName));
    const absolutePath = this.resolveAbsolutePath(relPath);

    await ensureParentDirectory(absolutePath);
    await failIfExists(absolutePath);
    await fs.writeFile(
      absolutePath,
      serializeMarkdownFile(request.frontmatter ?? {}, request.markdownBody ?? ""),
      "utf8"
    );

    const result = mutationResult("page.changed", relPath, ["tree", "body", "frontmatter"]);
    this.publishResultEvents(result);
    return result;
  }

  async createFolder(request: CreateFolderRequest): Promise<WorkspaceMutationResult> {
    const parentPath = normalizeWorkspacePath(request.parentPath);
    const folderName = cleanWorkspaceName(request.name);
    const relPath = normalizeWorkspacePath(path.posix.join(parentPath, folderName));
    const absolutePath = this.resolveAbsolutePath(relPath);

    await failIfExists(absolutePath);
    await fs.mkdir(absolutePath, { recursive: false });

    const indexPath = folderIndexPathForDirectory(relPath);
    await fs.writeFile(this.resolveAbsolutePath(indexPath), request.markdownBody ?? `# ${folderName}\n`, "utf8");

    const result = mutationResult("folder.childrenChanged", relPath, ["tree", "body"]);
    this.publishResultEvents(result);
    return result;
  }

  async renameNode(request: RenameNodeRequest): Promise<WorkspaceMutationResult> {
    const oldPath = normalizeWorkspacePath(request.path);
    const absoluteOldPath = this.resolveAbsolutePath(oldPath);
    const stat = await fs.stat(absoluteOldPath);
    const parentPath = path.posix.dirname(oldPath) === "." ? "" : path.posix.dirname(oldPath);
    const newName = cleanWorkspaceName(request.newName);
    const finalName = stat.isFile() && oldPath.toLowerCase().endsWith(".md") ? ensureMarkdownName(newName) : newName;
    const newPath = normalizeWorkspacePath(path.posix.join(parentPath, finalName));
    const absoluteNewPath = this.resolveAbsolutePath(newPath);

    await failIfExists(absoluteNewPath);
    await fs.rename(absoluteOldPath, absoluteNewPath);

    if (stat.isDirectory()) {
      await renameDirectoryCompanionAfterDirectoryRename(newPath, path.posix.basename(oldPath), this.resolveAbsolutePath.bind(this));
    }

    const result = mutationResult("page.moved", newPath, ["tree"], oldPath);
    this.publishResultEvents(result);
    return result;
  }

  async moveNode(request: MoveNodeRequest): Promise<WorkspaceMutationResult> {
    const oldPath = normalizeWorkspacePath(request.path);
    const newParentPath = normalizeWorkspacePath(request.newParentPath);
    const absoluteOldPath = this.resolveAbsolutePath(oldPath);
    const stat = await fs.stat(absoluteOldPath);
    const newPath = normalizeWorkspacePath(path.posix.join(newParentPath, path.posix.basename(oldPath)));
    const absoluteNewPath = this.resolveAbsolutePath(newPath);

    if (oldPath === newPath) {
      const result = mutationResult("page.moved", newPath, ["tree"], oldPath);
      this.publishResultEvents(result);
      return result;
    }

    if (stat.isDirectory() && (newPath.startsWith(`${oldPath}/`) || newPath === oldPath)) {
      throw new Error("Cannot move a folder into itself");
    }

    await fs.mkdir(path.dirname(absoluteNewPath), { recursive: true });
    await failIfExists(absoluteNewPath);
    await fs.rename(absoluteOldPath, absoluteNewPath);

    const result = mutationResult("page.moved", newPath, ["tree"], oldPath);
    this.publishResultEvents(result);
    return result;
  }

  async deleteNode(request: DeleteNodeRequest): Promise<WorkspaceMutationResult> {
    const relPath = normalizeWorkspacePath(request.path);
    const absolutePath = this.resolveAbsolutePath(relPath);
    const stat = await fs.stat(absolutePath);

    if (stat.isDirectory()) {
      await fs.rm(absolutePath, { recursive: request.recursive ?? false });
    } else {
      await fs.unlink(absolutePath);
    }

    const result = mutationResult("page.deleted", relPath, ["tree"]);
    this.publishResultEvents(result);
    return result;
  }

  async rebuildIndex(): Promise<{ status: "ok"; indexedAt: string }> {
    return {
      status: "ok",
      indexedAt: new Date().toISOString()
    };
  }

  async reconcileWorkspace(): Promise<WorkspaceReconcileResult> {
    const watcher = await this.getWorkspaceWatcher();
    return watcher.reconcile();
  }

  async startWatchingWorkspace(): Promise<void> {
    const watcher = await this.getWorkspaceWatcher();
    await watcher.start();
  }

  async stopWatchingWorkspace(): Promise<void> {
    await this.workspaceWatcher?.stop();
    this.workspaceWatcher = null;
  }

  private async readDirectoryTree(relPath: string): Promise<WorkspaceNode> {
    const absolutePath = this.resolveAbsolutePath(relPath);
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const normalized = normalizeWorkspacePath(relPath);
    const directoryName = normalized === "" ? this.name : path.posix.basename(normalized);
    const dbCompanion = normalized === "" ? null : databaseConfigPathForDirectory(normalized);
    const indexCompanion = normalized === "" ? null : folderIndexPathForDirectory(normalized);
    const entryNames = new Set(entries.map((entry) => entry.name));
    const hasDbCompanion = dbCompanion ? entryNames.has(path.posix.basename(dbCompanion)) : false;
    const hasIndexCompanion = indexCompanion ? entryNames.has(path.posix.basename(indexCompanion)) : false;
    const kind: WorkspaceNodeKind =
      normalized === "" ? "workspace" : hasDbCompanion ? "database" : "folder";
    const children: WorkspaceNode[] = [];

    for (const entry of entries.sort(compareDirectoryEntries)) {
      const childPath = normalized === "" ? entry.name : path.posix.join(normalized, entry.name);

      if (isHiddenFromTree(childPath)) {
        continue;
      }

      if (childPath === dbCompanion || childPath === indexCompanion) {
        continue;
      }

      if (entry.isDirectory()) {
        children.push(await this.readDirectoryTree(childPath));
        continue;
      }

      if (entry.isFile()) {
        children.push({
          path: childPath,
          name: entry.name,
          kind: nodeKindForFile(childPath)
        });
      }
    }

    const node: WorkspaceNode = {
      path: normalized,
      name: directoryName,
      kind,
      children
    };

    if (hasDbCompanion && dbCompanion) {
      node.companionPath = dbCompanion;
    } else if (hasIndexCompanion && indexCompanion) {
      node.companionPath = indexCompanion;
    }

    return node;
  }

  private async resolvePageTarget(inputPath: string): Promise<{ path: string; kind: PageDocumentKind }> {
    const relPath = normalizeWorkspacePath(inputPath);
    const absolutePath = this.resolveAbsolutePath(relPath);
    const stat = await fs.stat(absolutePath);

    if (stat.isDirectory()) {
      const dbConfig = databaseConfigPathForDirectory(relPath);
      const indexPath = folderIndexPathForDirectory(relPath);

      if (await fileExists(this.resolveAbsolutePath(dbConfig))) {
        return { path: dbConfig, kind: "database" };
      }

      if (await fileExists(this.resolveAbsolutePath(indexPath))) {
        return { path: indexPath, kind: "folder" };
      }

      throw new Error(`Directory has no Rumi page companion: ${relPath}`);
    }

    const fileKind = classifyFilePath(relPath);

    if (fileKind === "database-config") {
      return { path: relPath, kind: "database" };
    }

    if (fileKind === "folder-index") {
      return { path: relPath, kind: "folder" };
    }

    if (fileKind === "page") {
      return { path: relPath, kind: "page" };
    }

    throw new Error(`Path is not an editable Markdown page: ${relPath}`);
  }

  private resolveAbsolutePath(relPath: string): string {
    const normalized = normalizeWorkspacePath(relPath);
    const resolved = path.resolve(this.rootPath, normalized);
    const rootWithSeparator = this.rootPath.endsWith(path.sep) ? this.rootPath : `${this.rootPath}${path.sep}`;

    if (resolved !== this.rootPath && !resolved.startsWith(rootWithSeparator)) {
      throw new Error(`Workspace path escapes root: ${relPath}`);
    }

    return resolved;
  }

  private publishResultEvents(result: WorkspaceMutationResult): void {
    for (const event of result.events) {
      this.events.publish(event);
    }
  }

  private async getWorkspaceWatcher(): Promise<WorkspaceWatcher> {
    if (!this.workspaceWatcher) {
      this.workspaceWatcher = await WorkspaceWatcher.create({
        rootPath: this.rootPath,
        onEvents: (events) => {
          for (const event of events) {
            this.events.publish(event);
          }
        }
      });
    }

    return this.workspaceWatcher;
  }
}

export async function createTempWorkspace(prefix = "rumi-runtime-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function nodeKindForFile(relPath: string): WorkspaceNodeKind {
  const fileKind = classifyFilePath(relPath);

  if (fileKind === "asset") {
    return "asset";
  }

  if (fileKind === "page" || fileKind === "folder-index" || fileKind === "database-config") {
    return "page";
  }

  return "file";
}

function compareDirectoryEntries(a: import("node:fs").Dirent, b: import("node:fs").Dirent): number {
  if (a.isDirectory() && !b.isDirectory()) {
    return -1;
  }

  if (!a.isDirectory() && b.isDirectory()) {
    return 1;
  }

  return a.name.localeCompare(b.name);
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value: FrontmatterRecord): string {
  return hashText(JSON.stringify(sortJson(value)));
}

function ensureMarkdownName(name: string): string {
  return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function failIfExists(filePath: string): Promise<void> {
  const exists = await fs
    .stat(filePath)
    .then(() => true)
    .catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        return false;
      }
      throw error;
    });

  if (exists) {
    throw new Error(`Path already exists: ${filePath}`);
  }
}

async function renameDirectoryCompanionAfterDirectoryRename(
  newDirPath: string,
  oldDirName: string,
  resolveAbsolutePath: (relPath: string) => string
): Promise<void> {
  const newDirName = path.posix.basename(newDirPath);
  const companionPairs: Array<[string, string]> = [
    [`${oldDirName}.index.md`, `${newDirName}.index.md`],
    [`${oldDirName}.db.md`, `${newDirName}.db.md`]
  ];

  for (const [oldName, newName] of companionPairs) {
    const oldCompanionPath = path.posix.join(newDirPath, oldName);
    const newCompanionPath = path.posix.join(newDirPath, newName);
    const absoluteOld = resolveAbsolutePath(oldCompanionPath);

    if (await fileExists(absoluteOld)) {
      await failIfExists(resolveAbsolutePath(newCompanionPath));
      await fs.rename(absoluteOld, resolveAbsolutePath(newCompanionPath));
    }
  }
}

function mutationResult(
  name: "page.changed" | "page.moved" | "page.deleted" | "folder.childrenChanged",
  relPath: string,
  affects: string[],
  previousPath?: string
): WorkspaceMutationResult {
  return {
    status: "ok",
    path: relPath,
    ...(previousPath ? { previousPath } : {}),
    events: [
      {
        name,
        path: relPath,
        ...(previousPath ? { previousPath } : {}),
        affects
      }
    ]
  };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }

  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

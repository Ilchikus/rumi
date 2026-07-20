import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  CheckpointRequest,
  CreateDatabasePropertyOptionRequest,
  CreateFolderRequest,
  CreateDatabaseRecordRequest,
  CreateDatabaseRequest,
  CreatePageRequest,
  DeleteNodeRequest,
  FrontmatterRecord,
  MoveNodeRequest,
  OpenWorkspaceResult,
  PageDatabaseContext,
  PageDocument,
  PageDocumentKind,
  QueryDatabaseRequest,
  QueryDatabaseResult,
  RenameDatabasePropertyRequest,
  RenameNodeRequest,
  RestoreRevisionRequest,
  RevisionContentResult,
  RevisionEntry,
  RumiEvent,
  RumiEventEnvelope,
  SavePageRequest,
  SavePageResult,
  SaveAssetResult,
  SearchWorkspaceRequest,
  SearchWorkspaceResult,
  UpdateDatabaseRecordPropertyRequest,
  UpdateDatabaseSchemaRequest,
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
import {
  databaseFrontmatter,
  ensureDatabaseRecordPath,
  loadDatabaseConfig,
  queryDatabaseRecords
} from "./database";
import { RevisionStore } from "./revisions";
import { WorkspaceIndex } from "./workspace-index";

export interface WorkspaceRuntimeOptions {
  rootPath: string;
}

export interface WorkspaceAsset {
  path: string;
  fileName: string;
  contentType: string;
  data: Buffer;
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
  private readonly revisions: RevisionStore;
  private readonly workspaceIndex: WorkspaceIndex;
  private workspaceWatcher: WorkspaceWatcher | null = null;

  private constructor(rootPath: string, workspaceIndex: WorkspaceIndex) {
    this.rootPath = rootPath;
    this.name = path.basename(rootPath);
    this.revisions = new RevisionStore({ rootPath });
    this.workspaceIndex = workspaceIndex;
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

    return new WorkspaceRuntime(rootPath, await WorkspaceIndex.open(rootPath));
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

  async readAsset(inputPath: string): Promise<WorkspaceAsset> {
    const relPath = normalizeWorkspacePath(inputPath);
    const segments = relPath.split("/");
    const extension = path.posix.extname(relPath).toLocaleLowerCase();

    if (
      !SAFE_ASSET_CONTENT_TYPES[extension] ||
      segments.some((segment) => segment.startsWith(".") && segment !== ".assets")
    ) {
      throw new Error(`Path is not a readable workspace asset: ${inputPath}`);
    }

    const absolutePath = this.resolveAbsolutePath(relPath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) throw new Error(`Workspace asset is not a file: ${inputPath}`);

    return {
      path: relPath,
      fileName: path.basename(relPath),
      contentType: SAFE_ASSET_CONTENT_TYPES[extension]!,
      data: await fs.readFile(absolutePath)
    };
  }

  async saveAsset(fileName: string, data: Uint8Array): Promise<SaveAssetResult> {
    const cleanedName = sanitizeAssetFileName(fileName);
    const extension = path.posix.extname(cleanedName).toLocaleLowerCase();
    const contentType = SAFE_ASSET_CONTENT_TYPES[extension];
    if (!contentType) throw new Error(`Unsupported asset type: ${extension || "unknown"}`);

    await fs.mkdir(this.resolveAbsolutePath(".assets"), { recursive: true });
    const stem = path.posix.basename(cleanedName, extension);
    let index = 1;
    let relPath = path.posix.join(".assets", `${stem}${extension}`);

    while (await fileExists(this.resolveAbsolutePath(relPath))) {
      index += 1;
      relPath = path.posix.join(".assets", `${stem}-${index}${extension}`);
    }

    await fs.writeFile(this.resolveAbsolutePath(relPath), data, { flag: "wx" });
    const event: RumiEvent = {
      name: "asset.changed",
      path: relPath,
      changedBy: "editor",
      affects: ["asset", "workspace-tree"]
    };
    this.events.publish(event);
    return {
      status: "saved",
      path: relPath,
      fileName: path.posix.basename(relPath),
      contentType,
      events: [event]
    };
  }

  async openPage(inputPath: string): Promise<PageDocument> {
    const target = await this.resolvePageTarget(inputPath);
    const absolutePath = this.resolveAbsolutePath(target.path);
    const content = await fs.readFile(absolutePath, "utf8");
    const parsed = parseMarkdownFile(content);
    const database = target.kind === "page" ? await this.databaseContextForPage(target.path) : null;

    return {
      path: target.path,
      kind: target.kind,
      frontmatter: parsed.frontmatter,
      markdownBody: parsed.body,
      contentHash: hashText(content),
      frontmatterHash: hashJson(parsed.frontmatter),
      version: hashText(content),
      ...(database ? { database } : {})
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

    if (currentContent !== null) {
      await this.revisions.captureBaseline(relPath, currentContent, saveSource(request.reason));
    }

    const nextContent = serializeMarkdownFile(request.frontmatter, request.markdownBody);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, nextContent, "utf8");
    await this.workspaceIndex.indexPath(relPath);

    const nextHash = hashText(nextContent);

    if (request.reason === "manual-save") {
      await this.revisions.checkpoint(
        relPath,
        nextContent,
        "manual-checkpoint",
        saveSource(request.reason)
      );
    } else {
      this.revisions.noteActivity(relPath, nextContent, saveSource(request.reason));
    }

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
      changedIndexes: ["workspace-content"],
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
    await this.revisions.checkpoint(
      relPath,
      await fs.readFile(absolutePath, "utf8"),
      "baseline",
      "runtime"
    );
    await this.workspaceIndex.indexPath(relPath);

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
    await this.revisions.checkpoint(
      indexPath,
      await fs.readFile(this.resolveAbsolutePath(indexPath), "utf8"),
      "baseline",
      "runtime"
    );
    await this.workspaceIndex.indexPath(indexPath);

    const result = mutationResult("folder.childrenChanged", relPath, ["tree", "body"]);
    this.publishResultEvents(result);
    return result;
  }

  async createDatabase(request: CreateDatabaseRequest): Promise<WorkspaceMutationResult> {
    const parentPath = normalizeWorkspacePath(request.parentPath);
    const databaseName = cleanWorkspaceName(request.name);
    const relPath = normalizeWorkspacePath(path.posix.join(parentPath, databaseName));
    const absolutePath = this.resolveAbsolutePath(relPath);

    await failIfExists(absolutePath);
    await fs.mkdir(absolutePath, { recursive: false });

    const configPath = databaseConfigPathForDirectory(relPath);
    await fs.writeFile(
      this.resolveAbsolutePath(configPath),
      serializeMarkdownFile(
        {
          type: "database",
          properties: {},
          views: [{ name: "All", type: "table", columns: [] }]
        },
        request.markdownBody ?? ""
      ),
      "utf8"
    );
    await this.revisions.checkpoint(
      configPath,
      await fs.readFile(this.resolveAbsolutePath(configPath), "utf8"),
      "baseline",
      "runtime"
    );
    await this.workspaceIndex.indexPath(configPath);

    const result: WorkspaceMutationResult = {
      status: "ok",
      path: relPath,
      events: [
        { name: "database.schemaChanged", path: relPath, affects: ["tree", "schema", "body"] },
        { name: "workspace.treeChanged", path: relPath, affects: ["tree"] }
      ]
    };
    this.publishResultEvents(result);
    return result;
  }

  async queryDatabase(request: QueryDatabaseRequest): Promise<QueryDatabaseResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const records = await this.workspaceIndex.databaseRecords(config.databasePath);
    return queryDatabaseRecords(config, records, request);
  }

  async createDatabaseRecord(
    request: CreateDatabaseRecordRequest
  ): Promise<WorkspaceMutationResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const requestedName = request.name ? cleanWorkspaceName(request.name) : null;
    const recordPath = requestedName
      ? normalizeWorkspacePath(path.posix.join(config.databasePath, ensureMarkdownName(requestedName)))
      : await this.nextUntitledRecordPath(config.databasePath);
    const absolutePath = this.resolveAbsolutePath(recordPath);

    await failIfExists(absolutePath);
    await fs.writeFile(
      absolutePath,
      serializeMarkdownFile(request.frontmatter ?? {}, request.markdownBody ?? ""),
      "utf8"
    );
    await this.revisions.checkpoint(
      recordPath,
      await fs.readFile(absolutePath, "utf8"),
      "baseline",
      "runtime"
    );
    await this.workspaceIndex.indexPath(recordPath);

    const result: WorkspaceMutationResult = {
      status: "ok",
      path: recordPath,
      events: [
        {
          name: "page.changed",
          path: recordPath,
          changedBy: "database.createRecord",
          affects: ["tree", "frontmatter", "body"]
        },
        { name: "database.recordsChanged", path: config.databasePath, affects: ["records"] },
        { name: "workspace.treeChanged", path: recordPath, affects: ["tree"] }
      ]
    };
    this.publishResultEvents(result);
    return result;
  }

  async updateDatabaseRecordProperty(
    request: UpdateDatabaseRecordPropertyRequest
  ): Promise<SavePageResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const recordPath = ensureDatabaseRecordPath(config.databasePath, request.recordPath);
    const page = await this.openPage(recordPath);
    const frontmatter = { ...page.frontmatter };

    if (request.value === undefined) {
      delete frontmatter[request.property];
    } else {
      frontmatter[request.property] = request.value;
    }

    const result = await this.savePage({
      path: recordPath,
      ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
      frontmatter,
      markdownBody: page.markdownBody,
      reason: "property-edit"
    });

    if (result.status === "conflict") {
      return result;
    }

    const databaseEvent: RumiEvent = {
      name: "database.recordsChanged",
      path: config.databasePath,
      affects: ["records", request.property]
    };
    this.events.publish(databaseEvent);

    return {
      ...result,
      events: [...result.events, databaseEvent]
    };
  }

  async updateDatabaseSchema(request: UpdateDatabaseSchemaRequest): Promise<SavePageResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const result = await this.savePage({
      path: config.configPath,
      ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
      frontmatter: databaseFrontmatter(config.frontmatter, request.properties, request.views),
      markdownBody: config.markdownBody,
      reason: "property-edit"
    });

    if (result.status === "conflict") {
      return result;
    }

    const databaseEvent: RumiEvent = {
      name: "database.schemaChanged",
      path: config.databasePath,
      affects: ["schema", "views"]
    };
    this.events.publish(databaseEvent);

    return {
      ...result,
      events: [...result.events, databaseEvent]
    };
  }

  async createDatabasePropertyOption(
    request: CreateDatabasePropertyOptionRequest
  ): Promise<SavePageResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const property = request.property.trim();
    const option = request.option.trim();
    const definition = config.schema.properties[property];

    if (!definition || (definition.type !== "select" && definition.type !== "multi-select")) {
      throw new Error(`Database property is not a select: ${property || request.property}`);
    }

    if (!option) {
      throw new Error("Database option name cannot be empty");
    }

    if ((definition.options ?? []).some((candidate) => candidate.name.toLowerCase() === option.toLowerCase())) {
      throw new Error(`Database option already exists: ${option}`);
    }

    return this.updateDatabaseSchema({
      databasePath: config.databasePath,
      ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
      properties: {
        ...config.schema.properties,
        [property]: {
          ...definition,
          options: [...(definition.options ?? []), { name: option }]
        }
      },
      views: config.schema.views
    });
  }

  async renameDatabaseProperty(request: RenameDatabasePropertyRequest): Promise<SavePageResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const property = request.property.trim();
    const newName = request.newName.trim();

    if (!property || !config.schema.properties[property]) {
      throw new Error(`Database property does not exist: ${property || request.property}`);
    }

    if (!newName) {
      throw new Error("Database property name cannot be empty");
    }

    const allPropertyNames = new Set([
      ...Object.keys(config.schema.properties),
      ...config.schema.unsupportedProperties
    ]);

    if (property !== newName && allPropertyNames.has(newName)) {
      throw new Error(`Database property already exists: ${newName}`);
    }

    if (property === newName) {
      return this.updateDatabaseSchema({
        databasePath: config.databasePath,
        ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
        properties: config.schema.properties,
        views: config.schema.views
      });
    }

    const records = (await this.queryDatabase({ databasePath: config.databasePath })).records;

    for (const record of records) {
      if (
        Object.prototype.hasOwnProperty.call(record.frontmatter, property) &&
        Object.prototype.hasOwnProperty.call(record.frontmatter, newName)
      ) {
        throw new Error(`${record.path} already has a ${newName} property`);
      }
    }

    const properties = Object.fromEntries(
      Object.entries(config.schema.properties).map(([name, definition]) => [
        name === property ? newName : name,
        definition
      ])
    );
    const views = config.schema.views.map((view) => ({
      ...view,
      columns: view.columns.map((column) => (column === property ? newName : column)),
      ...(view.filters
        ? {
            filters: view.filters.map((filter) => ({
              ...filter,
              property: filter.property === property ? newName : filter.property
            }))
          }
        : {}),
      ...(view.sorts
        ? {
            sorts: view.sorts.map((sort) => ({
              ...sort,
              property: sort.property === property ? newName : sort.property
            }))
          }
        : {})
    }));
    const schemaResult = await this.updateDatabaseSchema({
      databasePath: config.databasePath,
      ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
      properties,
      views
    });

    if (schemaResult.status === "conflict") {
      return schemaResult;
    }

    for (const record of records) {
      if (!Object.prototype.hasOwnProperty.call(record.frontmatter, property)) {
        continue;
      }

      const value = record.frontmatter[property];
      await this.updateDatabaseRecordProperty({
        databasePath: config.databasePath,
        recordPath: record.path,
        baseVersion: record.version,
        property,
        value: undefined
      });
      const latest = await this.openPage(record.path);
      await this.updateDatabaseRecordProperty({
        databasePath: config.databasePath,
        recordPath: record.path,
        baseVersion: latest.version,
        property: newName,
        value
      });
    }

    return schemaResult;
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

    await this.revisions.move(oldPath, newPath);
    await this.workspaceIndex.movePath(oldPath, newPath);

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
    await this.revisions.move(oldPath, newPath);
    await this.workspaceIndex.movePath(oldPath, newPath);

    const result = mutationResult("page.moved", newPath, ["tree"], oldPath);
    this.publishResultEvents(result);
    return result;
  }

  async deleteNode(request: DeleteNodeRequest): Promise<WorkspaceMutationResult> {
    const relPath = normalizeWorkspacePath(request.path);
    const absolutePath = this.resolveAbsolutePath(relPath);
    const stat = await fs.stat(absolutePath);

    await this.checkpointNodeBeforeDelete(relPath, absolutePath, stat);

    if (stat.isDirectory()) {
      await fs.rm(absolutePath, { recursive: request.recursive ?? false });
    } else {
      await fs.unlink(absolutePath);
    }

    await this.revisions.markDeleted(relPath);
    this.workspaceIndex.removePath(relPath);

    const result = mutationResult("page.deleted", relPath, ["tree"]);
    this.publishResultEvents(result);
    return result;
  }

  async rebuildIndex(): Promise<{ status: "ok"; indexedAt: string; documentCount: number }> {
    const documentCount = await this.workspaceIndex.rebuild();
    const event: RumiEvent = { name: "index.rebuilt", affects: ["search", "database"] };
    this.events.publish(event);
    return {
      status: "ok",
      indexedAt: new Date().toISOString(),
      documentCount
    };
  }

  async searchWorkspace(request: SearchWorkspaceRequest): Promise<SearchWorkspaceResult> {
    return this.workspaceIndex.search(request);
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
    await this.revisions.flush();
    this.workspaceIndex.close();
    this.workspaceWatcher = null;
  }

  async checkpointNow(request: CheckpointRequest): Promise<RevisionEntry> {
    const target = await this.resolvePageTarget(request.path);
    const content = await fs.readFile(this.resolveAbsolutePath(target.path), "utf8");
    return this.revisions.checkpoint(
      target.path,
      content,
      request.reason ?? "manual-checkpoint",
      "api"
    );
  }

  async listRevisions(inputPath: string): Promise<RevisionEntry[]> {
    const target = await this.resolvePageTarget(inputPath);
    return this.revisions.list(target.path);
  }

  async getRevision(revisionId: string): Promise<RevisionContentResult> {
    return this.revisions.get(revisionId);
  }

  async restoreRevision(request: RestoreRevisionRequest): Promise<RevisionEntry> {
    const selected = await this.revisions.get(request.revisionId);
    const currentObjectPath = await this.revisions.currentPathForObject(selected.revision.objectId);
    const targetInput = request.targetPath ?? currentObjectPath ?? selected.revision.contentPath;
    const target = request.targetPath
      ? await this.resolvePageTarget(request.targetPath).catch(() => ({
          path: normalizeWorkspacePath(request.targetPath!),
          kind: "page" as const
        }))
      : { path: normalizeWorkspacePath(targetInput), kind: "page" as const };
    const absolutePath = this.resolveAbsolutePath(target.path);
    const currentContent = await fs.readFile(absolutePath, "utf8").catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

    if (currentContent !== null) {
      await this.revisions.checkpoint(
        target.path,
        currentContent,
        "before-restore",
        "runtime"
      );
    }

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, selected.markdown, "utf8");
    await this.workspaceIndex.indexPath(target.path);
    const restored = await this.revisions.checkpoint(
      target.path,
      selected.markdown,
      "restore",
      "runtime",
      selected.revision.revisionId
    );
    const event: RumiEvent = {
      name: "page.changed",
      path: target.path,
      version: restored.contentHash,
      contentHash: restored.contentHash,
      changedBy: "revision.restore",
      affects: ["frontmatter", "body"]
    };
    this.events.publish(event);
    return restored;
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

  private async nextUntitledRecordPath(databasePath: string): Promise<string> {
    let index = 1;

    while (true) {
      const name = index === 1 ? "Untitled.md" : `Untitled ${index}.md`;
      const recordPath = normalizeWorkspacePath(path.posix.join(databasePath, name));

      if (!(await fileExists(this.resolveAbsolutePath(recordPath)))) {
        return recordPath;
      }

      index += 1;
    }
  }

  private async databaseContextForPage(pagePath: string): Promise<PageDatabaseContext | null> {
    const databasePath = path.posix.dirname(pagePath);

    if (databasePath === "." || databasePath === "") {
      return null;
    }

    const configPath = databaseConfigPathForDirectory(databasePath);

    if (!(await fileExists(this.resolveAbsolutePath(configPath)))) {
      return null;
    }

    const config = await loadDatabaseConfig(this.rootPath, databasePath);
    return {
      databasePath: config.databasePath,
      schema: config.schema,
      schemaVersion: config.version
    };
  }

  private async checkpointNodeBeforeDelete(
    relPath: string,
    absolutePath: string,
    stat: import("node:fs").Stats
  ): Promise<void> {
    if (stat.isFile()) {
      const kind = classifyFilePath(relPath);

      if (kind === "page" || kind === "folder-index" || kind === "database-config") {
        const content = await fs.readFile(absolutePath, "utf8");
        await this.revisions.checkpoint(relPath, content, "before-delete", "runtime");
      }

      return;
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      const childPath = normalizeWorkspacePath(path.posix.join(relPath, entry.name));
      const childAbsolutePath = path.join(absolutePath, entry.name);
      await this.checkpointNodeBeforeDelete(childPath, childAbsolutePath, await fs.stat(childAbsolutePath));
    }
  }

  private async getWorkspaceWatcher(): Promise<WorkspaceWatcher> {
    if (!this.workspaceWatcher) {
      this.workspaceWatcher = await WorkspaceWatcher.create({
        rootPath: this.rootPath,
        onEvents: async (events) => {
          await this.syncIndexForEvents(events);
          for (const event of events) {
            this.events.publish(event);
          }
        }
      });
    }

    return this.workspaceWatcher;
  }

  private async syncIndexForEvents(events: RumiEvent[]): Promise<void> {
    for (const event of events) {
      if (event.name === "page.changed" && event.path) {
        await this.workspaceIndex.indexPath(event.path);
      } else if (event.name === "page.deleted" && event.path) {
        this.workspaceIndex.removePath(event.path);
      } else if (event.name === "page.moved" && event.path && event.previousPath) {
        await this.workspaceIndex.movePath(event.previousPath, event.path);
      }
    }
  }
}

const SAFE_ASSET_CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp"
};

function sanitizeAssetFileName(fileName: string): string {
  const base = path.posix.basename(fileName.replace(/\\/gu, "/"));
  const cleaned = base
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 180);
  if (!cleaned || cleaned.startsWith(".")) throw new Error("Asset file name is invalid");
  return cleaned;
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

function saveSource(reason: SavePageRequest["reason"]): "editor" | "api" | "cli" | "runtime" {
  if (reason === "editor-autosave" || reason === "property-edit" || reason === "manual-save") {
    return "editor";
  }

  return reason === "cli" ? "cli" : reason === "api" ? "api" : "runtime";
}

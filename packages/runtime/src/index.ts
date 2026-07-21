import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  CheckpointRequest,
  ChangeDatabasePropertyTypeRequest,
  ConvertContainerRequest,
  DatabasePropertyDefinition,
  DatabasePropertyType,
  CreateDatabasePropertyOptionRequest,
  CreateFolderRequest,
  CreateDatabaseRecordRequest,
  CreateDatabaseRequest,
  CreatePageRequest,
  DeleteNodeRequest,
  DeleteDatabasePropertyRequest,
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
  RestoreTrashItemRequest,
  RestoreTrashItemResult,
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
  TrashListResult,
  UpdateDatabaseRecordPropertyRequest,
  UpdateDatabasePropertyOptionRequest,
  UpdateDatabaseSchemaRequest,
  WorkspaceNode,
  WorkspaceNodeKind,
  WorkspaceMutationResult
} from "@rumi/contracts";
import { DATABASE_PROPERTY_OPTION_COLORS } from "@rumi/contracts";
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
import {
  planWorkspaceReferenceRepairs,
  rewriteMarkdownReferences
} from "./reference-repair";
import { WorkspaceTrash } from "./trash";
import { WorkspaceIndex } from "./workspace-index";
import {
  assetContentMatchesFileType,
  loadWorkspaceAssetPolicy,
  SUPPORTED_ASSET_CONTENT_TYPES,
  type WorkspaceAssetPolicy
} from "./workspace-config";

export {
  MAX_ASSET_FILE_SIZE_MB,
  SUPPORTED_ASSET_CONTENT_TYPES,
  WORKSPACE_CONFIG_PATH,
  type WorkspaceAssetPolicy
} from "./workspace-config";

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
  readonly assetPolicy: WorkspaceAssetPolicy;
  readonly events = new RuntimeEventBus();
  private readonly revisions: RevisionStore;
  private readonly trash: WorkspaceTrash;
  private readonly workspaceIndex: WorkspaceIndex;
  private readonly backgroundTasks = new Set<Promise<void>>();
  private workspaceWatcher: WorkspaceWatcher | null = null;

  private constructor(
    rootPath: string,
    workspaceIndex: WorkspaceIndex,
    assetPolicy: WorkspaceAssetPolicy
  ) {
    this.rootPath = rootPath;
    this.name = path.basename(rootPath);
    this.assetPolicy = assetPolicy;
    this.revisions = new RevisionStore({ rootPath });
    this.trash = new WorkspaceTrash(rootPath);
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

    const assetPolicy = await loadWorkspaceAssetPolicy(rootPath);
    const runtime = new WorkspaceRuntime(
      rootPath,
      await WorkspaceIndex.open(rootPath),
      assetPolicy
    );
    await runtime.ensureRootIndexPage();
    return runtime;
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
      !SUPPORTED_ASSET_CONTENT_TYPES[extension] ||
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
      contentType: SUPPORTED_ASSET_CONTENT_TYPES[extension]!,
      data: await fs.readFile(absolutePath)
    };
  }

  async saveAsset(fileName: string, data: Uint8Array): Promise<SaveAssetResult> {
    const cleanedName = sanitizeAssetFileName(fileName);
    const extension = path.posix.extname(cleanedName).toLocaleLowerCase();
    const contentType = SUPPORTED_ASSET_CONTENT_TYPES[extension];
    if (!contentType) throw new Error(`Unsupported asset type: ${extension || "unknown"}`);
    if (!this.assetPolicy.allowedFileTypes.includes(extension)) {
      throw new Error(`Asset type is not allowed by this workspace: ${extension}`);
    }
    if (data.byteLength === 0) throw new Error("Asset content is required");
    if (data.byteLength > this.assetPolicy.maxFileSizeBytes) {
      throw new Error(`Asset exceeds this workspace's ${this.assetPolicy.maxFileSizeMb} MB upload limit`);
    }
    if (!assetContentMatchesFileType(extension, data)) {
      throw new Error(`Asset content does not match its ${extension} file type`);
    }

    await fs.mkdir(this.resolveAbsolutePath(".assets"), { recursive: true });
    const desiredPath = path.posix.join(".assets", cleanedName);
    const relPath = await availableWorkspacePath(
      desiredPath,
      false,
      this.resolveAbsolutePath.bind(this)
    );

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
    const desiredPath = normalizeWorkspacePath(path.posix.join(parentPath, pageName));
    const relPath = await availableWorkspacePath(
      desiredPath,
      false,
      this.resolveAbsolutePath.bind(this)
    );
    const absolutePath = this.resolveAbsolutePath(relPath);

    await ensureParentDirectory(absolutePath);
    await fs.writeFile(
      absolutePath,
      serializeMarkdownFile(request.frontmatter ?? {}, request.markdownBody ?? ""),
      { encoding: "utf8", flag: "wx" }
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
    const desiredPath = normalizeWorkspacePath(path.posix.join(parentPath, folderName));
    const relPath = await availableWorkspacePath(
      desiredPath,
      true,
      this.resolveAbsolutePath.bind(this)
    );
    const absolutePath = this.resolveAbsolutePath(relPath);

    await fs.mkdir(absolutePath, { recursive: false });

    const indexPath = folderIndexPathForDirectory(relPath);
    await fs.writeFile(this.resolveAbsolutePath(indexPath), request.markdownBody ?? "", "utf8");
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
    const desiredPath = normalizeWorkspacePath(path.posix.join(parentPath, databaseName));
    const relPath = await availableWorkspacePath(
      desiredPath,
      true,
      this.resolveAbsolutePath.bind(this)
    );
    const absolutePath = this.resolveAbsolutePath(relPath);

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

  async convertContainer(request: ConvertContainerRequest): Promise<WorkspaceMutationResult> {
    const containerPath = normalizeWorkspacePath(request.path);
    if (!containerPath) throw new Error("The workspace root cannot be converted");
    if (request.targetKind !== "folder" && request.targetKind !== "database") {
      throw new Error(`Unsupported container kind: ${String(request.targetKind)}`);
    }

    const absoluteContainerPath = this.resolveAbsolutePath(containerPath);
    const stat = await fs.stat(absoluteContainerPath);
    if (!stat.isDirectory()) throw new Error(`Container path must be a directory: ${containerPath}`);

    const indexPath = folderIndexPathForDirectory(containerPath);
    const databasePath = databaseConfigPathForDirectory(containerPath);
    const sourcePath = request.targetKind === "database" ? indexPath : databasePath;
    const targetPath = request.targetKind === "database" ? databasePath : indexPath;
    const sourceContent = await fs.readFile(this.resolveAbsolutePath(sourcePath), "utf8").catch(
      (error: unknown) => {
        if (isNodeError(error) && error.code === "ENOENT") {
          throw new Error(
            `${request.targetKind === "database" ? "Folder" : "Database"} companion does not exist: ${sourcePath}`
          );
        }
        throw error;
      }
    );
    await failIfExists(this.resolveAbsolutePath(targetPath));

    const parsedSource = parseMarkdownFile(sourceContent);
    const changedRecords: Array<{
      path: string;
      previousContent: string;
      nextContent: string;
      contentHash: string;
    }> = [];
    let targetContent: string;

    if (request.targetKind === "database") {
      const records = await this.readDirectContainerPages(containerPath);
      const properties = inferMergedDatabaseProperties(records.map((record) => record.frontmatter));
      const propertyNames = Object.keys(properties);

      for (const record of records) {
        const frontmatter = Object.fromEntries(
          propertyNames.map((property) => [
            property,
            normalizeConvertedDatabaseValue(record.frontmatter[property], properties[property]!.type)
          ])
        );
        const nextContent = serializeMarkdownFile(frontmatter, record.markdownBody);
        if (nextContent === record.content) continue;
        changedRecords.push({
          path: record.path,
          previousContent: record.content,
          nextContent,
          contentHash: hashText(nextContent)
        });
      }

      const { type: _type, properties: _properties, views: _views, ...folderFrontmatter } =
        parsedSource.frontmatter;
      targetContent = serializeMarkdownFile(
        {
          ...folderFrontmatter,
          type: "database",
          properties,
          views: [{ name: "All", type: "table", columns: propertyNames }]
        },
        parsedSource.body
      );
    } else {
      const { type: _type, properties: _properties, views: _views, ...folderFrontmatter } =
        parsedSource.frontmatter;
      targetContent = serializeMarkdownFile(folderFrontmatter, parsedSource.body);
    }

    for (const record of changedRecords) {
      await this.revisions.checkpoint(
        record.path,
        record.previousContent,
        "before-container-conversion",
        "runtime"
      );
    }
    await this.revisions.checkpoint(sourcePath, sourceContent, "before-container-conversion", "runtime");

    const writtenRecords: typeof changedRecords = [];
    let companionMoved = false;
    try {
      for (const record of changedRecords) {
        await fs.writeFile(this.resolveAbsolutePath(record.path), record.nextContent, "utf8");
        writtenRecords.push(record);
      }
      await fs.rename(this.resolveAbsolutePath(sourcePath), this.resolveAbsolutePath(targetPath));
      companionMoved = true;
      await fs.writeFile(this.resolveAbsolutePath(targetPath), targetContent, "utf8");
    } catch (error) {
      await Promise.allSettled(
        writtenRecords.map((record) =>
          fs.writeFile(this.resolveAbsolutePath(record.path), record.previousContent, "utf8")
        )
      );
      if (companionMoved) {
        await fs.rename(this.resolveAbsolutePath(targetPath), this.resolveAbsolutePath(sourcePath))
          .catch(() => undefined);
        await fs.writeFile(this.resolveAbsolutePath(sourcePath), sourceContent, "utf8")
          .catch(() => undefined);
      }
      throw error;
    }

    for (const record of changedRecords) {
      await this.workspaceIndex.indexPath(record.path);
      await this.revisions.checkpoint(
        record.path,
        record.nextContent,
        "container-conversion",
        "runtime"
      );
    }
    await this.revisions.move(sourcePath, targetPath);
    await this.workspaceIndex.movePath(sourcePath, targetPath);
    await this.revisions.checkpoint(
      targetPath,
      targetContent,
      "container-conversion",
      "runtime"
    );

    const contentEvents: RumiEvent[] = changedRecords.map((record) => ({
      name: "page.changed",
      path: record.path,
      changedBy: "container-conversion",
      version: record.contentHash,
      contentHash: record.contentHash,
      affects: ["frontmatter", "database"]
    }));
    const result: WorkspaceMutationResult = {
      status: "ok",
      path: containerPath,
      events: [
        ...contentEvents,
        {
          name: "page.moved",
          path: targetPath,
          previousPath: sourcePath,
          affects: ["tree", "links", "search"]
        },
        ...(request.targetKind === "database"
          ? [
              {
                name: "database.schemaChanged" as const,
                path: containerPath,
                affects: ["tree", "schema", "body"]
              },
              {
                name: "database.recordsChanged" as const,
                path: containerPath,
                affects: ["records", "frontmatter"]
              }
            ]
          : [
              {
                name: "folder.childrenChanged" as const,
                path: containerPath,
                affects: ["tree", "body"]
              }
            ]),
        { name: "workspace.treeChanged", path: containerPath, affects: ["tree"] }
      ]
    };
    this.publishResultEvents(result);
    this.scheduleReferenceRepair(sourcePath, targetPath);
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
    const desiredPath = normalizeWorkspacePath(path.posix.join(
      config.databasePath,
      requestedName ? ensureMarkdownName(requestedName) : "Untitled.md"
    ));
    const recordPath = await availableWorkspacePath(
      desiredPath,
      false,
      this.resolveAbsolutePath.bind(this)
    );
    const absolutePath = this.resolveAbsolutePath(recordPath);

    await fs.writeFile(
      absolutePath,
      serializeMarkdownFile(request.frontmatter ?? {}, request.markdownBody ?? ""),
      { encoding: "utf8", flag: "wx" }
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

    if (request.color && !DATABASE_PROPERTY_OPTION_COLORS.includes(request.color)) {
      throw new Error(`Unsupported database option color: ${request.color}`);
    }

    const color = request.color ?? randomDatabasePropertyOptionColor();

    return this.updateDatabaseSchema({
      databasePath: config.databasePath,
      ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
      properties: {
        ...config.schema.properties,
        [property]: {
          ...definition,
          options: [...(definition.options ?? []), { name: option, color }]
        }
      },
      views: config.schema.views
    });
  }

  async updateDatabasePropertyOption(
    request: UpdateDatabasePropertyOptionRequest
  ): Promise<SavePageResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const property = request.property.trim();
    const optionName = request.option.trim();
    const definition = config.schema.properties[property];

    if (!["rename", "change-color", "delete"].includes(request.action)) {
      throw new Error(`Unsupported database option action: ${String(request.action)}`);
    }

    if (!definition || (definition.type !== "select" && definition.type !== "multi-select")) {
      throw new Error(`Database property is not a select: ${property || request.property}`);
    }

    const currentOption = (definition.options ?? []).find((option) => option.name === optionName);
    if (!currentOption) {
      throw new Error(`Database option does not exist: ${optionName || request.option}`);
    }

    let replacementName: string | undefined;
    if (request.action === "rename") {
      replacementName = request.newName.trim();
      if (!replacementName) {
        throw new Error("Database option name cannot be empty");
      }
      if (
        replacementName.toLowerCase() !== optionName.toLowerCase() &&
        (definition.options ?? []).some(
          (option) => option.name.toLowerCase() === replacementName?.toLowerCase()
        )
      ) {
        throw new Error(`Database option already exists: ${replacementName}`);
      }
    }

    if (
      request.action === "change-color" &&
      !DATABASE_PROPERTY_OPTION_COLORS.includes(request.color)
    ) {
      throw new Error(`Unsupported database option color: ${request.color}`);
    }

    const nextOptions = (definition.options ?? []).flatMap((option) => {
      if (option.name !== optionName) return [option];
      if (request.action === "delete") return [];
      if (request.action === "rename") return [{ ...option, name: replacementName ?? option.name }];
      return [{ ...option, color: request.color }];
    });
    const records = request.action === "change-color"
      ? []
      : (await this.queryDatabase({ databasePath: config.databasePath })).records;
    const views = config.schema.views.map((view) => ({
      ...view,
      ...(view.filters
        ? {
            filters: view.filters.flatMap((filter) => {
              if (filter.property !== property) return [filter];
              const nextValue = updateDatabaseOptionReference(
                filter.value,
                optionName,
                request.action === "rename" ? replacementName : undefined
              );
              return nextValue === undefined && filter.value !== undefined
                ? []
                : [{ ...filter, value: nextValue }];
            })
          }
        : {})
    }));
    const schemaResult = await this.updateDatabaseSchema({
      databasePath: config.databasePath,
      ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
      properties: {
        ...config.schema.properties,
        [property]: { ...definition, options: nextOptions }
      },
      views
    });

    if (schemaResult.status === "conflict" || request.action === "change-color") {
      return schemaResult;
    }

    for (const record of records) {
      if (!Object.prototype.hasOwnProperty.call(record.frontmatter, property)) continue;
      const currentValue = record.frontmatter[property];
      const nextValue = updateDatabaseOptionReference(
        currentValue,
        optionName,
        request.action === "rename" ? replacementName : undefined
      );
      if (JSON.stringify(nextValue) === JSON.stringify(currentValue)) continue;
      await this.updateDatabaseRecordProperty({
        databasePath: config.databasePath,
        recordPath: record.path,
        baseVersion: record.version,
        property,
        value: nextValue
      });
    }

    return schemaResult;
  }

  async changeDatabasePropertyType(
    request: ChangeDatabasePropertyTypeRequest
  ): Promise<SavePageResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const property = request.property.trim();
    const definition = config.schema.properties[property];

    if (!["text", "number", "date", "checkbox", "select", "multi-select"].includes(request.type)) {
      throw new Error(`Unsupported database property type: ${String(request.type)}`);
    }

    if (!definition) {
      throw new Error(`Database property does not exist: ${property || request.property}`);
    }

    const records = (await this.queryDatabase({ databasePath: config.databasePath })).records;
    const convertedValues = records.map((record) => ({
      record,
      value: convertDatabasePropertyValue(record.frontmatter[property], request.type)
    }));
    const nextDefinition = databasePropertyDefinitionForType(
      request.type,
      definition,
      convertedValues.map(({ value }) => value)
    );
    const schemaResult = await this.updateDatabaseSchema({
      databasePath: config.databasePath,
      ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
      properties: { ...config.schema.properties, [property]: nextDefinition },
      views: config.schema.views
    });

    if (schemaResult.status === "conflict") return schemaResult;

    for (const { record, value } of convertedValues) {
      if (!Object.prototype.hasOwnProperty.call(record.frontmatter, property)) continue;
      if (JSON.stringify(value) === JSON.stringify(record.frontmatter[property])) continue;
      await this.updateDatabaseRecordProperty({
        databasePath: config.databasePath,
        recordPath: record.path,
        baseVersion: record.version,
        property,
        value
      });
    }

    return schemaResult;
  }

  async deleteDatabaseProperty(
    request: DeleteDatabasePropertyRequest
  ): Promise<SavePageResult> {
    const config = await loadDatabaseConfig(this.rootPath, request.databasePath);
    const property = request.property.trim();

    if (!config.schema.properties[property]) {
      throw new Error(`Database property does not exist: ${property || request.property}`);
    }

    const records = (await this.queryDatabase({ databasePath: config.databasePath })).records;
    const { [property]: _deleted, ...properties } = config.schema.properties;
    const views = config.schema.views.map((view) => ({
      ...view,
      columns: view.columns.filter((column) => column !== property),
      ...(view.filters
        ? { filters: view.filters.filter((filter) => filter.property !== property) }
        : {}),
      ...(view.sorts ? { sorts: view.sorts.filter((sort) => sort.property !== property) } : {})
    }));
    const schemaResult = await this.updateDatabaseSchema({
      databasePath: config.databasePath,
      ...(request.baseVersion ? { baseVersion: request.baseVersion } : {}),
      properties,
      views
    });

    if (schemaResult.status === "conflict") return schemaResult;

    for (const record of records) {
      if (!Object.prototype.hasOwnProperty.call(record.frontmatter, property)) continue;
      await this.updateDatabaseRecordProperty({
        databasePath: config.databasePath,
        recordPath: record.path,
        baseVersion: record.version,
        property,
        value: undefined
      });
    }

    return schemaResult;
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
    const desiredPath = normalizeWorkspacePath(path.posix.join(parentPath, finalName));

    if (desiredPath === oldPath) {
      return { status: "ok", path: oldPath, previousPath: oldPath, events: [] };
    }

    const newPath = await availableWorkspacePath(
      desiredPath,
      stat.isDirectory(),
      this.resolveAbsolutePath.bind(this)
    );
    const absoluteNewPath = this.resolveAbsolutePath(newPath);

    await fs.rename(absoluteOldPath, absoluteNewPath);

    if (stat.isDirectory()) {
      await renameDirectoryCompanionAfterDirectoryRename(newPath, path.posix.basename(oldPath), this.resolveAbsolutePath.bind(this));
    }

    await this.revisions.move(oldPath, newPath);
    await this.workspaceIndex.movePath(oldPath, newPath);

    const result = mutationResult("page.moved", newPath, ["tree", "links", "search"], oldPath);
    this.publishResultEvents(result);
    this.scheduleReferenceRepair(oldPath, newPath);
    return result;
  }

  async moveNode(request: MoveNodeRequest): Promise<WorkspaceMutationResult> {
    const oldPath = normalizeWorkspacePath(request.path);
    const newParentPath = normalizeWorkspacePath(request.newParentPath);
    const absoluteOldPath = this.resolveAbsolutePath(oldPath);
    const stat = await fs.stat(absoluteOldPath);
    const desiredPath = normalizeWorkspacePath(path.posix.join(newParentPath, path.posix.basename(oldPath)));

    if (oldPath === desiredPath) {
      const result = mutationResult("page.moved", desiredPath, ["tree"], oldPath);
      this.publishResultEvents(result);
      return result;
    }

    if (stat.isDirectory() && desiredPath.startsWith(`${oldPath}/`)) {
      throw new Error("Cannot move a folder into itself");
    }

    const newPath = await availableWorkspacePath(
      desiredPath,
      stat.isDirectory(),
      this.resolveAbsolutePath.bind(this)
    );
    const absoluteNewPath = this.resolveAbsolutePath(newPath);
    await fs.mkdir(path.dirname(absoluteNewPath), { recursive: true });
    await fs.rename(absoluteOldPath, absoluteNewPath);
    if (stat.isDirectory() && path.posix.basename(oldPath) !== path.posix.basename(newPath)) {
      await renameDirectoryCompanionAfterDirectoryRename(
        newPath,
        path.posix.basename(oldPath),
        this.resolveAbsolutePath.bind(this)
      );
    }
    await this.revisions.move(oldPath, newPath);
    await this.workspaceIndex.movePath(oldPath, newPath);

    const result = mutationResult("page.moved", newPath, ["tree", "links", "search"], oldPath);
    this.publishResultEvents(result);
    this.scheduleReferenceRepair(oldPath, newPath);
    return result;
  }

  async deleteNode(request: DeleteNodeRequest): Promise<WorkspaceMutationResult> {
    const relPath = normalizeWorkspacePath(request.path);
    if (!relPath || relPath === "." || relPath.split("/")[0]?.toLocaleLowerCase() === ".rumi") {
      throw new Error("The workspace root and .rumi internals cannot be moved to Trash");
    }
    const absolutePath = this.resolveAbsolutePath(relPath);
    const stat = await fs.stat(absolutePath);

    if (stat.isDirectory() && !request.recursive) {
      throw new Error("Deleting a folder or database requires recursive confirmation");
    }

    await this.checkpointNodeBeforeDelete(relPath, absolutePath, stat);
    const revisionObjects = await this.revisions.objectsAtOrBelow(relPath);
    await this.trash.move(relPath, revisionObjects);
    await this.revisions.markDeleted(relPath);
    await this.workspaceIndex.removePath(relPath);

    const result = mutationResult("page.deleted", relPath, ["tree"]);
    this.publishResultEvents(result);
    return result;
  }

  async listTrash(): Promise<TrashListResult> {
    return { items: await this.trash.list() };
  }

  async restoreTrashItem(request: RestoreTrashItemRequest): Promise<RestoreTrashItemResult> {
    const restored = await this.trash.restore(request.id);
    await this.revisions.restoreObjects(
      restored.revisionObjects,
      restored.item.originalPath,
      restored.path
    );
    await this.workspaceIndex.indexPath(restored.path);
    const event: RumiEvent = {
      name: "workspace.treeChanged",
      path: restored.path,
      previousPath: restored.item.originalPath,
      changedBy: "trash.restore",
      affects: ["tree", "search", "database", "asset"]
    };
    this.events.publish(event);
    return {
      status: "ok",
      item: restored.item,
      path: restored.path,
      originalPath: restored.item.originalPath,
      restoredToOriginalPath: restored.path === restored.item.originalPath,
      events: [event]
    };
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
    await this.flushBackgroundTasks();
    await this.revisions.flush();
    this.workspaceIndex.close();
    this.workspaceWatcher = null;
  }

  async flushBackgroundTasks(): Promise<void> {
    await Promise.all([...this.backgroundTasks]);
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
    const rootIndexCandidates = normalized === "" ? rootIndexPaths(this.name) : [];
    const entryNames = new Set(entries.map((entry) => entry.name));
    const indexCompanion = normalized === ""
      ? rootIndexCandidates.find((candidate) => entryNames.has(candidate)) ?? null
      : folderIndexPathForDirectory(normalized);
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

      if (
        childPath === dbCompanion ||
        childPath === indexCompanion ||
        rootIndexCandidates.includes(childPath)
      ) {
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

  private async ensureRootIndexPage(): Promise<void> {
    for (const candidate of rootIndexPaths(this.name)) {
      if (await fileExists(this.resolveAbsolutePath(candidate))) return;
    }

    const rootIndexPath = "index.md";
    const absolutePath = this.resolveAbsolutePath(rootIndexPath);
    try {
      await fs.writeFile(absolutePath, "", { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") return;
      throw error;
    }

    await this.revisions.checkpoint(rootIndexPath, "", "baseline", "runtime");
    await this.workspaceIndex.indexPath(rootIndexPath);
  }

  private async resolvePageTarget(inputPath: string): Promise<{ path: string; kind: PageDocumentKind }> {
    const relPath = normalizeWorkspacePath(inputPath);
    const absolutePath = this.resolveAbsolutePath(relPath);
    const stat = await fs.stat(absolutePath);
    const rootIndexCandidates = rootIndexPaths(this.name);
    let rootIndexPath: string | null = null;

    for (const candidate of rootIndexCandidates) {
      if (await fileExists(this.resolveAbsolutePath(candidate))) {
        rootIndexPath = candidate;
        break;
      }
    }

    if (stat.isDirectory()) {
      if (relPath === "") {
        if (rootIndexPath) {
          return { path: rootIndexPath, kind: "folder" };
        }

        throw new Error("Workspace root has no Rumi index page");
      }

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

    if (rootIndexCandidates.includes(relPath)) {
      return { path: relPath, kind: "folder" };
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

  private async readDirectContainerPages(containerPath: string): Promise<Array<{
    path: string;
    content: string;
    frontmatter: FrontmatterRecord;
    markdownBody: string;
  }>> {
    const entries = await fs.readdir(this.resolveAbsolutePath(containerPath), {
      withFileTypes: true
    });
    const pagePaths = entries
      .filter((entry) => entry.isFile())
      .map((entry) => normalizeWorkspacePath(path.posix.join(containerPath, entry.name)))
      .filter((entryPath) => classifyFilePath(entryPath) === "page")
      .sort((left, right) => left.localeCompare(right));

    return Promise.all(
      pagePaths.map(async (pagePath) => {
        const content = await fs.readFile(this.resolveAbsolutePath(pagePath), "utf8");
        const parsed = parseMarkdownFile(content);
        return {
          path: pagePath,
          content,
          frontmatter: parsed.frontmatter,
          markdownBody: parsed.body
        };
      })
    );
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

  private scheduleReferenceRepair(previousPath: string, nextPath: string): void {
    let trackedTask: Promise<void>;
    trackedTask = this.repairReferencesAfterMove(previousPath, nextPath)
      .catch((error: unknown) => {
        console.error(
          `Rumi could not finish reference repair after moving ${previousPath} to ${nextPath}:`,
          error
        );
      })
      .finally(() => {
        this.backgroundTasks.delete(trackedTask);
      });
    this.backgroundTasks.add(trackedTask);
  }

  private async repairReferencesAfterMove(previousPath: string, nextPath: string): Promise<void> {
    // A second pass catches a file that was itself moved while the first scan was running.
    for (let pass = 0; pass < 2; pass += 1) {
      const repairs = await planWorkspaceReferenceRepairs(this.rootPath, previousPath, nextPath);

      for (const planned of repairs) {
        const absolutePath = this.resolveAbsolutePath(planned.path);
        const currentMarkdown = await fs.readFile(absolutePath, "utf8").catch((error: unknown) => {
          if (isNodeError(error) && error.code === "ENOENT") return null;
          throw error;
        });
        if (currentMarkdown === null) continue;

        const rewritten = currentMarkdown === planned.previousMarkdown
          ? { markdown: planned.markdown, referenceCount: planned.referenceCount }
          : rewriteMarkdownReferences(currentMarkdown, previousPath, nextPath, planned.path);
        if (rewritten.referenceCount === 0 || rewritten.markdown === currentMarkdown) continue;

        await this.revisions.checkpoint(
          planned.path,
          currentMarkdown,
          "before-reference-repair",
          "runtime"
        );
        await fs.writeFile(absolutePath, rewritten.markdown, "utf8");
        await this.workspaceIndex.indexPath(planned.path);
        this.revisions.noteActivity(planned.path, rewritten.markdown, "runtime");

        const contentHash = hashText(rewritten.markdown);
        this.events.publish({
          name: "page.changed",
          path: planned.path,
          referenceRepair: { previousPath, nextPath },
          version: contentHash,
          contentHash,
          changedBy: "reference-repair",
          affects: ["body", "frontmatter", "links", "search"]
        });
      }
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
        await this.workspaceIndex.removePath(event.path);
      } else if (event.name === "page.moved" && event.path && event.previousPath) {
        await this.workspaceIndex.movePath(event.previousPath, event.path);
      }
    }
  }
}

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

async function availableWorkspacePath(
  desiredPath: string,
  isDirectory: boolean,
  resolveAbsolutePath: (relPath: string) => string
): Promise<string> {
  const normalized = normalizeWorkspacePath(desiredPath);
  if (!(await pathExists(resolveAbsolutePath(normalized)))) return normalized;

  const directory = path.posix.dirname(normalized);
  const basename = path.posix.basename(normalized);
  const extension = isDirectory ? "" : path.posix.extname(basename);
  const stem = extension ? basename.slice(0, -extension.length) : basename;
  let index = 1;

  while (true) {
    const candidateName = `${stem} (${index})${extension}`;
    const candidate = directory === "." ? candidateName : path.posix.join(directory, candidateName);
    if (!(await pathExists(resolveAbsolutePath(candidate)))) return candidate;
    index += 1;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") return false;
      throw error;
    });
}

function rootIndexPaths(workspaceName: string): string[] {
  return [`${workspaceName}.index.md`, "index.md"];
}

async function failIfExists(filePath: string): Promise<void> {
  const exists = await pathExists(filePath);

  if (exists) {
    const error = new Error(`Path already exists: ${filePath}`) as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
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

function randomDatabasePropertyOptionColor(): (typeof DATABASE_PROPERTY_OPTION_COLORS)[number] {
  const index = Math.floor(Math.random() * DATABASE_PROPERTY_OPTION_COLORS.length);
  return DATABASE_PROPERTY_OPTION_COLORS[index] ?? "neutral";
}

function updateDatabaseOptionReference(
  value: unknown,
  option: string,
  replacement: string | undefined
): unknown {
  if (typeof value === "string") {
    return value === option ? replacement : value;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      item === option ? (replacement === undefined ? [] : [replacement]) : [item]
    );
  }

  return value;
}

function databasePropertyDefinitionForType(
  type: DatabasePropertyType,
  current: DatabasePropertyDefinition,
  values: unknown[]
): DatabasePropertyDefinition {
  if (type !== "select" && type !== "multi-select") {
    return { type };
  }

  const existingOptions = current.type === "select" || current.type === "multi-select"
    ? [...(current.options ?? [])]
    : [];
  const optionNames = new Set(existingOptions.map((option) => option.name.toLowerCase()));
  const valueNames = values.flatMap((value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && Boolean(item))
      : typeof value === "string" && value
        ? [value]
        : []
  );

  for (const name of valueNames) {
    if (optionNames.has(name.toLowerCase())) continue;
    existingOptions.push({ name, color: randomDatabasePropertyOptionColor() });
    optionNames.add(name.toLowerCase());
  }

  return { type, options: existingOptions };
}

function convertDatabasePropertyValue(value: unknown, type: DatabasePropertyType): unknown {
  if (value === undefined || value === null || value === "") return undefined;

  switch (type) {
    case "text":
      return typeof value === "string"
        ? value
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const number = typeof value === "string" ? Number(value) : Number.NaN;
      return Number.isFinite(number) ? number : undefined;
    }
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value
        : undefined;
    case "checkbox":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        return ["true", "yes", "1"].includes(value.trim().toLowerCase());
      }
      return Boolean(value);
    case "select":
      if (Array.isArray(value)) {
        return value.find((item): item is string => typeof item === "string" && Boolean(item));
      }
      return typeof value === "string" ? value : String(value);
    case "multi-select":
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && Boolean(item))
        : [typeof value === "string" ? value : String(value)];
  }
}

function inferMergedDatabaseProperties(
  frontmatters: FrontmatterRecord[]
): Record<string, DatabasePropertyDefinition> {
  const propertyNames = [...new Set(frontmatters.flatMap((frontmatter) => Object.keys(frontmatter)))]
    .sort((left, right) => left.localeCompare(right));

  return Object.fromEntries(
    propertyNames.map((property) => {
      const values = frontmatters
        .map((frontmatter) => frontmatter[property])
        .filter((value) => value !== undefined && value !== null && value !== "");
      return [property, inferDatabasePropertyDefinition(values)];
    })
  );
}

function inferDatabasePropertyDefinition(values: unknown[]): DatabasePropertyDefinition {
  if (values.length === 0) return { type: "text" };
  if (values.every((value) => typeof value === "boolean")) return { type: "checkbox" };
  if (values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return { type: "number" };
  }
  if (
    values.every(
      (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    )
  ) {
    return { type: "date" };
  }
  if (
    values.every(
      (value) => Array.isArray(value) && value.every((item) => typeof item === "string")
    )
  ) {
    const optionNames = [...new Set(values.flatMap((value) => value as string[]).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    return {
      type: "multi-select",
      options: optionNames.map((name) => ({ name }))
    };
  }
  return { type: "text" };
}

function normalizeConvertedDatabaseValue(value: unknown, type: DatabasePropertyType): unknown {
  const converted = convertDatabasePropertyValue(value, type);
  if (converted !== undefined) return converted;
  if (type === "checkbox") return false;
  if (type === "multi-select") return [];
  return null;
}

function saveSource(reason: SavePageRequest["reason"]): "editor" | "api" | "cli" | "runtime" {
  if (reason === "editor-autosave" || reason === "property-edit" || reason === "manual-save") {
    return "editor";
  }

  return reason === "cli" ? "cli" : reason === "api" ? "api" : "runtime";
}

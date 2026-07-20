import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  RevisionContentResult,
  RevisionEntry,
  RevisionReason,
  RevisionSource
} from "@rumi/contracts";
import { classifyFilePath, normalizeWorkspacePath } from "@rumi/workspace-format";

interface RevisionStoreOptions {
  rootPath: string;
  idleMs?: number;
}

interface ObjectPathIndex {
  version: 1;
  byPath: Record<string, string>;
}

interface PendingCheckpoint {
  contentPath: string;
  markdown: string;
  source: RevisionSource;
  timer: ReturnType<typeof setTimeout>;
}

export class RevisionStore {
  private readonly rootPath: string;
  private readonly rumiPath: string;
  private readonly objectEventsPath: string;
  private readonly revisionEventsPath: string;
  private readonly pathIndexPath: string;
  private readonly blobRootPath: string;
  private readonly idleMs: number;
  private pathIndex: ObjectPathIndex | null = null;
  private revisionEntries: RevisionEntry[] | null = null;
  private readonly pending = new Map<string, PendingCheckpoint>();
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(options: RevisionStoreOptions) {
    this.rootPath = path.resolve(options.rootPath);
    this.rumiPath = path.join(this.rootPath, ".rumi");
    this.objectEventsPath = path.join(this.rumiPath, "objects", "events.jsonl");
    this.pathIndexPath = path.join(this.rumiPath, "objects", "path-index.json");
    this.revisionEventsPath = path.join(this.rumiPath, "revisions", "events.jsonl");
    this.blobRootPath = path.join(this.rumiPath, "revisions", "blobs", "sha256");
    this.idleMs = options.idleMs ?? 10_000;
  }

  async captureBaseline(contentPath: string, markdown: string, source: RevisionSource): Promise<void> {
    const normalized = normalizeWorkspacePath(contentPath);
    const objectId = await this.ensureObject(normalized);
    const entries = await this.loadRevisionEntries();

    if (entries.some((entry) => entry.objectId === objectId)) {
      return;
    }

    await this.checkpoint(normalized, markdown, "baseline", source);
  }

  noteActivity(contentPath: string, markdown: string, source: RevisionSource): void {
    const normalized = normalizeWorkspacePath(contentPath);
    const previous = this.pending.get(normalized);

    if (previous) {
      clearTimeout(previous.timer);
    }

    const timer = setTimeout(() => {
      const pending = this.pending.get(normalized);

      if (!pending || pending.timer !== timer) {
        return;
      }

      this.pending.delete(normalized);
      void this.checkpoint(
        pending.contentPath,
        pending.markdown,
        "idle-checkpoint",
        pending.source
      );
    }, this.idleMs);
    timer.unref?.();
    this.pending.set(normalized, { contentPath: normalized, markdown, source, timer });
  }

  async checkpoint(
    contentPath: string,
    markdown: string,
    reason: RevisionReason,
    source: RevisionSource,
    restoredFromRevisionId?: string
  ): Promise<RevisionEntry> {
    return this.enqueue(async () => {
      const normalized = normalizeWorkspacePath(contentPath);
      const objectId = await this.ensureObject(normalized);
      const entries = await this.loadRevisionEntries();
      const contentHash = hashText(markdown);
      const previous = [...entries].reverse().find((entry) => entry.objectId === objectId);

      if (
        previous &&
        previous.contentHash === contentHash &&
        reason !== "restore" &&
        reason !== "before-restore" &&
        reason !== "before-delete"
      ) {
        return previous;
      }

      await this.writeBlob(contentHash, markdown);
      const entry: RevisionEntry = {
        revisionId: `rev_${randomUUID()}`,
        type: restoredFromRevisionId ? "revision.restored" : "revision.checkpoint",
        objectId,
        objectPath: objectPathForContentPath(normalized),
        contentPath: normalized,
        contentRole: contentRoleForPath(normalized),
        contentHash,
        ...(previous ? { previousContentHash: previous.contentHash } : {}),
        reason,
        source,
        createdAt: new Date().toISOString(),
        ...(restoredFromRevisionId ? { restoredFromRevisionId } : {})
      };
      await appendJsonLine(this.revisionEventsPath, entry);
      entries.push(entry);
      return entry;
    });
  }

  async list(contentPath: string): Promise<RevisionEntry[]> {
    await this.flush(contentPath);
    const normalized = normalizeWorkspacePath(contentPath);
    const index = await this.loadPathIndex();
    const objectId = index.byPath[normalized];

    if (!objectId) {
      return [];
    }

    const entries = await this.loadRevisionEntries();
    return entries
      .filter((entry) => entry.objectId === objectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async get(revisionId: string): Promise<RevisionContentResult> {
    const entries = await this.loadRevisionEntries();
    const revision = entries.find((entry) => entry.revisionId === revisionId);

    if (!revision) {
      throw new Error(`Revision not found: ${revisionId}`);
    }

    const markdown = await fs.readFile(this.blobPath(revision.contentHash), "utf8");
    return { revision, markdown };
  }

  async currentPathForObject(objectId: string): Promise<string | null> {
    const index = await this.loadPathIndex();
    return Object.entries(index.byPath).find(([, candidate]) => candidate === objectId)?.[0] ?? null;
  }

  async move(previousPath: string, nextPath: string): Promise<void> {
    await this.enqueue(async () => {
      const previous = normalizeWorkspacePath(previousPath);
      const next = normalizeWorkspacePath(nextPath);
      const index = await this.loadPathIndex();
      const changes = Object.entries(index.byPath).filter(
        ([contentPath]) => contentPath === previous || contentPath.startsWith(`${previous}/`)
      );

      for (const [contentPath, objectId] of changes) {
        const nextContentPath = movedContentPath(contentPath, previous, next);
        delete index.byPath[contentPath];
        index.byPath[nextContentPath] = objectId;
        await appendJsonLine(this.objectEventsPath, {
          eventId: `evt_${randomUUID()}`,
          type: "object.moved",
          objectId,
          previousPath: objectPathForContentPath(contentPath),
          path: objectPathForContentPath(nextContentPath),
          previousContentPath: contentPath,
          contentPath: nextContentPath,
          confidence: "certain",
          createdAt: new Date().toISOString()
        });
      }

      if (changes.length > 0) {
        await this.writePathIndex(index);
      }
    });
  }

  async markDeleted(inputPath: string): Promise<void> {
    await this.enqueue(async () => {
      const target = normalizeWorkspacePath(inputPath);
      const index = await this.loadPathIndex();
      const changes = Object.entries(index.byPath).filter(
        ([contentPath]) => contentPath === target || contentPath.startsWith(`${target}/`)
      );

      for (const [contentPath, objectId] of changes) {
        delete index.byPath[contentPath];
        await appendJsonLine(this.objectEventsPath, {
          eventId: `evt_${randomUUID()}`,
          type: "object.deleted",
          objectId,
          path: objectPathForContentPath(contentPath),
          contentPath,
          confidence: "certain",
          createdAt: new Date().toISOString()
        });
      }

      if (changes.length > 0) {
        await this.writePathIndex(index);
      }
    });
  }

  async objectsAtOrBelow(inputPath: string): Promise<Record<string, string>> {
    const target = normalizeWorkspacePath(inputPath);
    const index = await this.loadPathIndex();
    return Object.fromEntries(
      Object.entries(index.byPath).filter(
        ([contentPath]) => contentPath === target || contentPath.startsWith(`${target}/`)
      )
    );
  }

  async restoreObjects(
    objects: Record<string, string>,
    previousRoot: string,
    restoredRoot: string
  ): Promise<void> {
    await this.enqueue(async () => {
      const previous = normalizeWorkspacePath(previousRoot);
      const restored = normalizeWorkspacePath(restoredRoot);
      const index = await this.loadPathIndex();

      for (const [contentPath, objectId] of Object.entries(objects)) {
        const nextContentPath = movedContentPath(contentPath, previous, restored);
        index.byPath[nextContentPath] = objectId;
        await appendJsonLine(this.objectEventsPath, {
          eventId: `evt_${randomUUID()}`,
          type: "object.restored",
          objectId,
          previousPath: objectPathForContentPath(contentPath),
          path: objectPathForContentPath(nextContentPath),
          previousContentPath: contentPath,
          contentPath: nextContentPath,
          confidence: "certain",
          createdAt: new Date().toISOString()
        });
      }

      if (Object.keys(objects).length > 0) await this.writePathIndex(index);
    });
  }

  async flush(contentPath?: string): Promise<void> {
    const normalized = contentPath ? normalizeWorkspacePath(contentPath) : null;
    const pending = [...this.pending.values()].filter(
      (entry) => normalized === null || entry.contentPath === normalized
    );

    for (const entry of pending) {
      clearTimeout(entry.timer);
      this.pending.delete(entry.contentPath);
      await this.checkpoint(entry.contentPath, entry.markdown, "idle-checkpoint", entry.source);
    }

    await this.writeQueue;
  }

  private async ensureObject(contentPath: string): Promise<string> {
    const index = await this.loadPathIndex();
    const existing = index.byPath[contentPath];

    if (existing) {
      return existing;
    }

    const objectId = `obj_${randomUUID()}`;
    index.byPath[contentPath] = objectId;
    await appendJsonLine(this.objectEventsPath, {
      eventId: `evt_${randomUUID()}`,
      type: "object.created",
      objectId,
      kind: contentRoleForPath(contentPath),
      path: objectPathForContentPath(contentPath),
      contentPath,
      contentRole: contentRoleForPath(contentPath),
      createdAt: new Date().toISOString()
    });
    await this.writePathIndex(index);
    return objectId;
  }

  private async loadPathIndex(): Promise<ObjectPathIndex> {
    if (this.pathIndex) {
      return this.pathIndex;
    }

    const content = await fs.readFile(this.pathIndexPath, "utf8").catch((error: unknown) => {
      if (isMissingPathError(error)) {
        return null;
      }
      throw error;
    });
    this.pathIndex = content
      ? (JSON.parse(content) as ObjectPathIndex)
      : { version: 1, byPath: {} };
    return this.pathIndex;
  }

  private async writePathIndex(index: ObjectPathIndex): Promise<void> {
    await fs.mkdir(path.dirname(this.pathIndexPath), { recursive: true });
    const temporaryPath = `${this.pathIndexPath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, this.pathIndexPath);
  }

  private async loadRevisionEntries(): Promise<RevisionEntry[]> {
    if (this.revisionEntries) {
      return this.revisionEntries;
    }

    const content = await fs.readFile(this.revisionEventsPath, "utf8").catch((error: unknown) => {
      if (isMissingPathError(error)) {
        return "";
      }
      throw error;
    });
    this.revisionEntries = content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RevisionEntry);
    return this.revisionEntries;
  }

  private async writeBlob(contentHash: string, markdown: string): Promise<void> {
    const blobPath = this.blobPath(contentHash);
    const exists = await fs.stat(blobPath).then(() => true).catch(() => false);

    if (exists) {
      return;
    }

    await fs.mkdir(path.dirname(blobPath), { recursive: true });
    const temporaryPath = `${blobPath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, markdown, "utf8");
    await fs.rename(temporaryPath, blobPath).catch(async (error: unknown) => {
      if (await fs.stat(blobPath).then(() => true).catch(() => false)) {
        await fs.rm(temporaryPath, { force: true });
        return;
      }
      throw error;
    });
  }

  private blobPath(contentHash: string): string {
    return path.join(this.blobRootPath, contentHash.slice(0, 2), `${contentHash}.md`);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function movedContentPath(contentPath: string, previousPath: string, nextPath: string): string {
  if (contentPath === previousPath) {
    return nextPath;
  }

  const relative = contentPath.slice(previousPath.length + 1);
  const previousName = path.posix.basename(previousPath);
  const nextName = path.posix.basename(nextPath);

  if (relative === `${previousName}.index.md`) {
    return path.posix.join(nextPath, `${nextName}.index.md`);
  }

  if (relative === `${previousName}.db.md`) {
    return path.posix.join(nextPath, `${nextName}.db.md`);
  }

  return path.posix.join(nextPath, relative);
}

function contentRoleForPath(contentPath: string): RevisionEntry["contentRole"] {
  const kind = classifyFilePath(contentPath);

  if (kind === "folder-index") {
    return "folder-index";
  }

  if (kind === "database-config") {
    return "database-config";
  }

  return "page";
}

function objectPathForContentPath(contentPath: string): string {
  const role = contentRoleForPath(contentPath);

  if (role === "page") {
    return contentPath;
  }

  return path.posix.dirname(contentPath);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

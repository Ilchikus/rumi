import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { RumiEvent } from "@rumi/contracts";
import {
  classifyFilePath,
  isHiddenFromTree,
  normalizeWorkspacePath,
  type WorkspaceFileKind
} from "@rumi/workspace-format";

export interface WorkspaceWatcherOptions {
  rootPath: string;
  debounceMs?: number;
  onEvents?: (events: RumiEvent[]) => void;
}

export interface WorkspaceReconcileResult {
  status: "ok";
  reconciledAt: string;
  events: RumiEvent[];
}

type SnapshotEntry =
  | {
      kind: "directory";
      path: string;
    }
  | {
      kind: "file";
      path: string;
      fileKind: WorkspaceFileKind;
      size: number;
      mtimeMs: number;
      contentHash: string;
      fingerprint: string;
    };

type WorkspaceSnapshot = Map<string, SnapshotEntry>;

export class WorkspaceWatcher {
  private readonly rootPath: string;
  private readonly debounceMs: number;
  private readonly onEvents: ((events: RumiEvent[]) => void) | undefined;
  private snapshot: WorkspaceSnapshot;
  private readonly directoryWatchers = new Map<string, FSWatcher>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconcileInFlight = false;
  private reconcileAgain = false;

  private constructor(options: WorkspaceWatcherOptions, snapshot: WorkspaceSnapshot) {
    this.rootPath = options.rootPath;
    this.debounceMs = options.debounceMs ?? 150;
    this.onEvents = options.onEvents;
    this.snapshot = snapshot;
  }

  static async create(options: WorkspaceWatcherOptions): Promise<WorkspaceWatcher> {
    const snapshot = await scanWorkspace(options.rootPath);
    return new WorkspaceWatcher(options, snapshot);
  }

  async start(): Promise<void> {
    await this.refreshDirectoryWatchers();
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    for (const directoryWatcher of this.directoryWatchers.values()) {
      directoryWatcher.close();
    }

    this.directoryWatchers.clear();
  }

  async reconcile(): Promise<WorkspaceReconcileResult> {
    const events = await this.reconcileSnapshot();

    if (events.length > 0) {
      this.onEvents?.(events);
    }

    return {
      status: "ok",
      reconciledAt: new Date().toISOString(),
      events
    };
  }

  private scheduleReconcile(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.reconcileFromWatcher();
    }, this.debounceMs);
  }

  private async reconcileFromWatcher(): Promise<void> {
    if (this.reconcileInFlight) {
      this.reconcileAgain = true;
      return;
    }

    this.reconcileInFlight = true;

    try {
      do {
        this.reconcileAgain = false;
        await this.reconcile();
      } while (this.reconcileAgain);
    } finally {
      this.reconcileInFlight = false;
    }
  }

  private async reconcileSnapshot(): Promise<RumiEvent[]> {
    const nextSnapshot = await scanWorkspace(this.rootPath);
    const events = diffSnapshots(this.snapshot, nextSnapshot);
    this.snapshot = nextSnapshot;
    await this.refreshDirectoryWatchers();
    return events;
  }

  private async refreshDirectoryWatchers(): Promise<void> {
    const nextDirectories = new Set(
      [...this.snapshot.values()]
        .filter((entry) => entry.kind === "directory")
        .map((entry) => entry.path)
    );

    for (const [directoryPath, directoryWatcher] of this.directoryWatchers) {
      if (!nextDirectories.has(directoryPath)) {
        directoryWatcher.close();
        this.directoryWatchers.delete(directoryPath);
      }
    }

    for (const directoryPath of nextDirectories) {
      if (this.directoryWatchers.has(directoryPath)) {
        continue;
      }

      const absolutePath = path.join(this.rootPath, directoryPath);

      try {
        const directoryWatcher = watch(absolutePath, { persistent: true }, () => {
          this.scheduleReconcile();
        });
        directoryWatcher.on("error", () => {
          this.directoryWatchers.delete(directoryPath);
          this.scheduleReconcile();
        });
        this.directoryWatchers.set(directoryPath, directoryWatcher);
      } catch {
        // Directory may have disappeared between snapshot and watch registration.
      }
    }
  }
}

async function scanWorkspace(rootPath: string): Promise<WorkspaceSnapshot> {
  const snapshot: WorkspaceSnapshot = new Map();
  await scanDirectory(rootPath, "", snapshot);
  return snapshot;
}

async function scanDirectory(
  rootPath: string,
  relPath: string,
  snapshot: WorkspaceSnapshot
): Promise<void> {
  const normalized = normalizeWorkspacePath(relPath);
  snapshot.set(normalized, {
    kind: "directory",
    path: normalized
  });

  let entries: import("node:fs").Dirent[];

  try {
    entries = await fs.readdir(path.join(rootPath, normalized), { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      snapshot.delete(normalized);
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    const childPath = normalizeWorkspacePath(path.posix.join(normalized, entry.name));

    if (isHiddenFromTree(childPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await scanDirectory(rootPath, childPath, snapshot);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileEntry = await scanFile(rootPath, childPath);

    if (fileEntry) {
      snapshot.set(childPath, fileEntry);
    }
  }
}

async function scanFile(rootPath: string, relPath: string): Promise<SnapshotEntry | null> {
  const absolutePath = path.join(rootPath, relPath);
  const fileKind = classifyFilePath(relPath);

  try {
    const [stat, content] = await Promise.all([fs.stat(absolutePath), fs.readFile(absolutePath)]);

    if (!stat.isFile()) {
      return null;
    }

    const contentHash = hashBuffer(content);

    return {
      kind: "file",
      path: relPath,
      fileKind,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      contentHash,
      fingerprint: `${contentHash}:${stat.size}`
    };
  } catch (error: unknown) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

function diffSnapshots(previous: WorkspaceSnapshot, current: WorkspaceSnapshot): RumiEvent[] {
  const added: SnapshotEntry[] = [];
  const removed: SnapshotEntry[] = [];
  const changedFiles: Extract<SnapshotEntry, { kind: "file" }>[] = [];

  for (const currentEntry of current.values()) {
    const previousEntry = previous.get(currentEntry.path);

    if (!previousEntry || previousEntry.kind !== currentEntry.kind) {
      added.push(currentEntry);
      continue;
    }

    if (
      currentEntry.kind === "file" &&
      previousEntry.kind === "file" &&
      previousEntry.contentHash !== currentEntry.contentHash
    ) {
      changedFiles.push(currentEntry);
    }
  }

  for (const previousEntry of previous.values()) {
    const currentEntry = current.get(previousEntry.path);

    if (!currentEntry || currentEntry.kind !== previousEntry.kind) {
      removed.push(previousEntry);
    }
  }

  const events: RumiEvent[] = [];
  const structuralChanged = added.length > 0 || removed.length > 0;
  const moveMatches = matchMovedFiles(removed, added);
  const movedAddedPaths = new Set(moveMatches.map((match) => match.current.path));
  const movedRemovedPaths = new Set(moveMatches.map((match) => match.previous.path));

  for (const changedFile of changedFiles) {
    const event = changedFileEvent(changedFile);

    if (event) {
      events.push(event);
    }
  }

  for (const moveMatch of moveMatches) {
    const event = movedFileEvent(moveMatch.previous, moveMatch.current);

    if (event) {
      events.push(event);
    }
  }

  for (const removedEntry of removed) {
    if (movedRemovedPaths.has(removedEntry.path)) {
      continue;
    }

    const event = removedEntryEvent(removedEntry);

    if (event) {
      events.push(event);
    }
  }

  for (const addedEntry of added) {
    if (movedAddedPaths.has(addedEntry.path)) {
      continue;
    }

    const event = addedEntryEvent(addedEntry);

    if (event) {
      events.push(event);
    }
  }

  if (structuralChanged) {
    events.push({
      name: "workspace.treeChanged",
      affects: ["tree"]
    });
  }

  return events;
}

function matchMovedFiles(
  removed: SnapshotEntry[],
  added: SnapshotEntry[]
): Array<{
  previous: Extract<SnapshotEntry, { kind: "file" }>;
  current: Extract<SnapshotEntry, { kind: "file" }>;
}> {
  const removedByFingerprint = groupUniqueFilesByFingerprint(removed);
  const addedByFingerprint = groupUniqueFilesByFingerprint(added);
  const matches: Array<{
    previous: Extract<SnapshotEntry, { kind: "file" }>;
    current: Extract<SnapshotEntry, { kind: "file" }>;
  }> = [];

  for (const [fingerprint, removedFile] of removedByFingerprint) {
    const addedFile = addedByFingerprint.get(fingerprint);

    if (addedFile) {
      matches.push({
        previous: removedFile,
        current: addedFile
      });
    }
  }

  return matches;
}

function groupUniqueFilesByFingerprint(
  entries: SnapshotEntry[]
): Map<string, Extract<SnapshotEntry, { kind: "file" }>> {
  const grouped = new Map<string, Extract<SnapshotEntry, { kind: "file" }>[]>();

  for (const entry of entries) {
    if (entry.kind !== "file") {
      continue;
    }

    const group = grouped.get(entry.fingerprint) ?? [];
    group.push(entry);
    grouped.set(entry.fingerprint, group);
  }

  const unique = new Map<string, Extract<SnapshotEntry, { kind: "file" }>>();

  for (const [fingerprint, group] of grouped) {
    if (group.length === 1) {
      unique.set(fingerprint, group[0]!);
    }
  }

  return unique;
}

function changedFileEvent(entry: Extract<SnapshotEntry, { kind: "file" }>): RumiEvent | null {
  if (isPageFileKind(entry.fileKind)) {
    return {
      name: "page.changed",
      path: entry.path,
      version: entry.contentHash,
      contentHash: entry.contentHash,
      changedBy: "filesystem",
      affects: ["body", "frontmatter"]
    };
  }

  if (entry.fileKind === "asset") {
    return {
      name: "asset.changed",
      path: entry.path,
      contentHash: entry.contentHash,
      changedBy: "filesystem",
      affects: ["content"]
    };
  }

  return null;
}

function movedFileEvent(
  previous: Extract<SnapshotEntry, { kind: "file" }>,
  current: Extract<SnapshotEntry, { kind: "file" }>
): RumiEvent | null {
  if (isPageFileKind(previous.fileKind) || isPageFileKind(current.fileKind)) {
    return {
      name: "page.moved",
      previousPath: previous.path,
      path: current.path,
      contentHash: current.contentHash,
      affects: ["tree"]
    };
  }

  if (previous.fileKind === "asset" || current.fileKind === "asset") {
    return {
      name: "asset.changed",
      previousPath: previous.path,
      path: current.path,
      contentHash: current.contentHash,
      changedBy: "filesystem",
      affects: ["tree"]
    };
  }

  return null;
}

function removedEntryEvent(entry: SnapshotEntry): RumiEvent | null {
  if (entry.kind !== "file") {
    return null;
  }

  if (isPageFileKind(entry.fileKind)) {
    return {
      name: "page.deleted",
      path: entry.path,
      affects: ["tree"]
    };
  }

  return null;
}

function addedEntryEvent(entry: SnapshotEntry): RumiEvent | null {
  if (entry.kind !== "file") {
    return null;
  }

  if (isPageFileKind(entry.fileKind)) {
    return {
      name: "page.changed",
      path: entry.path,
      version: entry.contentHash,
      contentHash: entry.contentHash,
      changedBy: "filesystem",
      affects: ["tree", "body", "frontmatter"]
    };
  }

  if (entry.fileKind === "asset") {
    return {
      name: "asset.changed",
      path: entry.path,
      contentHash: entry.contentHash,
      changedBy: "filesystem",
      affects: ["tree", "content"]
    };
  }

  return null;
}

function isPageFileKind(kind: WorkspaceFileKind): boolean {
  return kind === "page" || kind === "folder-index" || kind === "database-config";
}

function hashBuffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

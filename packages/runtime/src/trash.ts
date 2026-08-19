import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  PageDocumentKind,
  PagePresentation,
  TrashItem,
  TrashItemKind
} from "@rumi/contracts";
import type { PagePresentationSnapshot } from "./presentation";
import { classifyFilePath, normalizeWorkspacePath } from "@rumi/workspace-format";

interface TrashMetadata extends TrashItem {
  version: 1;
  payloadName: string;
  revisionObjects: Record<string, string>;
  presentationPages?: PagePresentationSnapshot;
}

export interface TrashedNode {
  item: TrashItem;
}

export interface PermanentlyDeletedNode {
  item: TrashItem;
}

export interface RestoredNode {
  item: TrashItem;
  path: string;
  revisionObjects: Record<string, string>;
  presentationPages: PagePresentationSnapshot;
}

export interface TrashedPageContent {
  item: TrashItem;
  path: string;
  kind: PageDocumentKind;
  content: string;
  presentation: PagePresentation;
}

export class WorkspaceTrash {
  private readonly rootPath: string;
  private readonly trashRootPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.trashRootPath = path.join(this.rootPath, ".rumi", "trash");
  }

  async list(): Promise<TrashItem[]> {
    const entries = await fs.readdir(this.trashRootPath, { withFileTypes: true }).catch((error: unknown) => {
      if (isMissingPathError(error)) return [];
      throw error;
    });
    const items = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const metadata = await this.readMetadata(entry.name);
            const payloadPath = path.join(this.trashRootPath, entry.name, "payload", metadata.payloadName);
            return (await pathExists(payloadPath)) ? publicItem(metadata) : null;
          } catch {
            return null;
          }
        })
    );

    return items
      .filter((item): item is TrashItem => item !== null)
      .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
  }

  async move(
    inputPath: string,
    revisionObjects: Record<string, string> = {},
    presentationPages: PagePresentationSnapshot = {}
  ): Promise<TrashedNode> {
    const originalPath = safeWorkspacePath(inputPath);
    const absolutePath = this.resolveWorkspacePath(originalPath);
    const stat = await fs.stat(absolutePath);
    const id = `${Date.now()}-${randomUUID()}`;
    const entryPath = path.join(this.trashRootPath, id);
    const payloadDirectory = path.join(entryPath, "payload");
    const payloadName = path.posix.basename(originalPath);
    const payloadPath = path.join(payloadDirectory, payloadName);
    const metadata: TrashMetadata = {
      version: 1,
      id,
      name: displayName(originalPath, stat.isDirectory()),
      kind: await classifyTrashItem(originalPath, absolutePath, stat.isDirectory()),
      originalPath,
      deletedAt: new Date().toISOString(),
      payloadName,
      revisionObjects,
      presentationPages
    };

    await fs.mkdir(payloadDirectory, { recursive: true });
    try {
      await fs.rename(absolutePath, payloadPath);
      await fs.writeFile(path.join(entryPath, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    } catch (error) {
      if (await pathExists(payloadPath)) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.rename(payloadPath, absolutePath).catch(() => undefined);
      }
      await fs.rm(entryPath, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }

    return { item: publicItem(metadata) };
  }

  async restore(id: string): Promise<RestoredNode> {
    const metadata = await this.readMetadata(id);
    const payloadPath = path.join(this.trashRootPath, id, "payload", metadata.payloadName);
    const payloadStat = await fs.stat(payloadPath);
    const desiredPath = safeWorkspacePath(metadata.originalPath);
    const restoredPath = await availableRestorePath(this.rootPath, desiredPath, payloadStat.isDirectory());
    const absoluteRestoredPath = this.resolveWorkspacePath(restoredPath);

    await fs.mkdir(path.dirname(absoluteRestoredPath), { recursive: true });
    await fs.rename(payloadPath, absoluteRestoredPath);

    try {
      if (payloadStat.isDirectory() && path.posix.basename(restoredPath) !== metadata.payloadName) {
        await renameDirectoryCompanions(absoluteRestoredPath, metadata.payloadName, path.posix.basename(restoredPath));
      }
      await fs.rm(path.join(this.trashRootPath, id), { recursive: true, force: true });
    } catch (error) {
      await fs.rename(absoluteRestoredPath, payloadPath).catch(() => undefined);
      throw error;
    }

    return {
      item: publicItem(metadata),
      path: restoredPath,
      revisionObjects: metadata.revisionObjects,
      presentationPages: metadata.presentationPages ?? {}
    };
  }

  async deleteForever(id: string): Promise<PermanentlyDeletedNode> {
    const metadata = await this.readMetadata(id);
    await fs.rm(path.join(this.trashRootPath, id), { recursive: true, force: false });
    return { item: publicItem(metadata) };
  }

  async readPage(id: string, requestedOriginalPath?: string): Promise<TrashedPageContent> {
    const metadata = await this.readMetadata(id);
    const payloadPath = path.join(this.trashRootPath, id, "payload", metadata.payloadName);
    let contentPath: string;
    let originalPagePath: string;
    let kind: PageDocumentKind;

    if (requestedOriginalPath) {
      const normalizedRequestedPath = safeWorkspacePath(requestedOriginalPath);
      const relativePath = path.posix.relative(metadata.originalPath, normalizedRequestedPath);
      if (
        metadata.kind === "page" ||
        !relativePath ||
        relativePath === "." ||
        relativePath === ".." ||
        relativePath.startsWith("../")
      ) {
        if (normalizedRequestedPath !== metadata.originalPath || metadata.kind !== "page") {
          throw new Error("Requested page is outside this Trash item");
        }
        contentPath = payloadPath;
      } else {
        contentPath = path.join(payloadPath, relativePath);
      }
      originalPagePath = normalizedRequestedPath;
      kind = pageDocumentKindForPath(normalizedRequestedPath);
    } else if (metadata.kind === "page") {
      contentPath = payloadPath;
      originalPagePath = metadata.originalPath;
      kind = "page";
    } else if (metadata.kind === "folder" || metadata.kind === "database") {
      const suffix = metadata.kind === "database" ? ".db.md" : ".index.md";
      contentPath = path.join(payloadPath, `${metadata.payloadName}${suffix}`);
      originalPagePath = path.posix.join(
        metadata.originalPath,
        `${metadata.payloadName}${suffix}`
      );
      kind = metadata.kind;
    } else {
      throw new Error("This Trash item does not have editable page content");
    }

    const [realPayloadPath, realContentPath] = await Promise.all([
      fs.realpath(payloadPath),
      fs.realpath(contentPath)
    ]);
    const contentIsInsidePayload = metadata.kind === "page"
      ? realContentPath === realPayloadPath
      : realContentPath.startsWith(`${realPayloadPath}${path.sep}`);
    if (!contentIsInsidePayload) {
      throw new Error("Requested Trash page escapes its payload");
    }

    return {
      item: publicItem(metadata),
      path: originalPagePath,
      kind,
      content: await fs.readFile(realContentPath, "utf8"),
      presentation: metadata.presentationPages?.[originalPagePath] ?? { images: {} }
    };
  }

  private async readMetadata(id: string): Promise<TrashMetadata> {
    if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error("Invalid trash item id");
    const metadataPath = path.join(this.trashRootPath, id, "metadata.json");
    const parsed = JSON.parse(await fs.readFile(metadataPath, "utf8")) as Partial<TrashMetadata>;

    if (
      parsed.version !== 1 ||
      parsed.id !== id ||
      typeof parsed.name !== "string" ||
      !isTrashItemKind(parsed.kind) ||
      typeof parsed.originalPath !== "string" ||
      typeof parsed.deletedAt !== "string" ||
      typeof parsed.payloadName !== "string" ||
      !parsed.revisionObjects ||
      typeof parsed.revisionObjects !== "object" ||
      (parsed.presentationPages !== undefined && typeof parsed.presentationPages !== "object")
    ) {
      throw new Error(`Invalid trash metadata: ${id}`);
    }

    safeWorkspacePath(parsed.originalPath);
    if (parsed.payloadName !== path.posix.basename(parsed.originalPath)) {
      throw new Error(`Invalid trash payload: ${id}`);
    }
    return parsed as TrashMetadata;
  }

  private resolveWorkspacePath(relPath: string): string {
    const resolved = path.resolve(this.rootPath, relPath);
    const rootWithSeparator = `${this.rootPath}${path.sep}`;
    if (!resolved.startsWith(rootWithSeparator)) throw new Error(`Workspace path escapes root: ${relPath}`);
    return resolved;
  }
}

function pageDocumentKindForPath(relPath: string): PageDocumentKind {
  const kind = classifyFilePath(relPath);
  if (kind === "page") return "page";
  if (kind === "folder-index") return "folder";
  if (kind === "database-config") return "database";
  throw new Error("Requested Trash content is not a page");
}

function safeWorkspacePath(inputPath: string): string {
  const normalized = normalizeWorkspacePath(inputPath);
  const firstSegment = normalized.split("/")[0]?.toLocaleLowerCase();
  if (!normalized || normalized === "." || firstSegment === ".rumi") {
    throw new Error("The workspace root and .rumi internals cannot be moved to Trash");
  }
  return normalized;
}

async function classifyTrashItem(
  relPath: string,
  absolutePath: string,
  isDirectory: boolean
): Promise<TrashItemKind> {
  if (isDirectory) {
    const name = path.posix.basename(relPath);
    return (await pathExists(path.join(absolutePath, `${name}.db.md`))) ? "database" : "folder";
  }
  if (relPath === ".assets" || relPath.startsWith(".assets/")) return "asset";
  return classifyFilePath(relPath) === "page" ? "page" : "file";
}

function displayName(relPath: string, isDirectory: boolean): string {
  const basename = path.posix.basename(relPath);
  return isDirectory ? basename : basename.replace(/\.md$/i, "");
}

async function availableRestorePath(rootPath: string, desiredPath: string, isDirectory: boolean): Promise<string> {
  if (!(await pathExists(path.join(rootPath, desiredPath)))) return desiredPath;
  const directory = path.posix.dirname(desiredPath);
  const basename = path.posix.basename(desiredPath);
  const extension = isDirectory ? "" : path.posix.extname(basename);
  const stem = extension ? basename.slice(0, -extension.length) : basename;
  let index = 1;

  while (true) {
    const candidateName = `${stem} (${index})${extension}`;
    const candidate = directory === "." ? candidateName : path.posix.join(directory, candidateName);
    if (!(await pathExists(path.join(rootPath, candidate)))) return candidate;
    index += 1;
  }
}

async function renameDirectoryCompanions(directoryPath: string, oldName: string, newName: string): Promise<void> {
  for (const suffix of [".index.md", ".db.md"]) {
    const previousPath = path.join(directoryPath, `${oldName}${suffix}`);
    const nextPath = path.join(directoryPath, `${newName}${suffix}`);
    if (await pathExists(previousPath)) {
      if (await pathExists(nextPath)) throw new Error(`Restore companion already exists: ${path.basename(nextPath)}`);
      await fs.rename(previousPath, nextPath);
    }
  }
}

function publicItem(metadata: TrashMetadata): TrashItem {
  const { id, name, kind, originalPath, deletedAt } = metadata;
  return { id, name, kind, originalPath, deletedAt };
}

function isTrashItemKind(value: unknown): value is TrashItemKind {
  return value === "page" || value === "folder" || value === "database" || value === "asset" || value === "file";
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs.stat(targetPath).then(() => true).catch((error: unknown) => {
    if (isMissingPathError(error)) return false;
    throw error;
  });
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

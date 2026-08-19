import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  MAX_IMAGE_PRESENTATION_WIDTH_PX,
  MIN_IMAGE_PRESENTATION_WIDTH_PX,
  type ImageAlignment,
  type ImagePresentation,
  type PagePresentation,
  type UpdateImagePresentationRequest
} from "@rumi/contracts";
import { rewriteMarkdownReferenceTarget } from "@rumi/markdown";
import { normalizeWorkspacePath } from "@rumi/workspace-format";

export const WORKSPACE_PRESENTATION_PATH = ".rumi/presentation.json";

interface StoredPresentation {
  schemaVersion: 1;
  pages: Record<string, PagePresentation>;
}

export type PagePresentationSnapshot = Record<string, PagePresentation>;

export interface OpenedPagePresentation {
  presentation: PagePresentation;
  presentationVersion: string;
}

export type ImagePresentationUpdate =
  | ({ status: "saved"; changed: boolean } & OpenedPagePresentation)
  | ({
      status: "conflict";
      attemptedBasePresentationVersion: string;
      currentPresentationVersion: string;
    } & Pick<OpenedPagePresentation, "presentation">);

const EMPTY_PRESENTATION: PagePresentation = Object.freeze({ images: Object.freeze({}) });

export class WorkspacePresentationStore {
  private state: StoredPresentation;
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly rootPath: string,
    state: StoredPresentation
  ) {
    this.state = state;
  }

  static async open(rootPath: string): Promise<WorkspacePresentationStore> {
    const resolvedRoot = path.resolve(rootPath);
    const storagePath = path.join(resolvedRoot, WORKSPACE_PRESENTATION_PATH);
    const source = await fs.readFile(storagePath, "utf8").catch((error: unknown) => {
      if (isMissingPathError(error)) return null;
      throw error;
    });
    return new WorkspacePresentationStore(
      resolvedRoot,
      source === null ? emptyStoredPresentation() : parseStoredPresentation(source)
    );
  }

  page(inputPath: string): OpenedPagePresentation {
    const pagePath = normalizeWorkspacePath(inputPath);
    const presentation = clonePagePresentation(this.state.pages[pagePath] ?? EMPTY_PRESENTATION);
    return {
      presentation,
      presentationVersion: pagePresentationVersion(presentation)
    };
  }

  async updateImage(request: UpdateImagePresentationRequest): Promise<ImagePresentationUpdate> {
    return this.enqueue(async () => {
      const pagePath = normalizeWorkspacePath(request.path);
      const imageSrc = validateImageSource(request.imageSrc);
      const patch = imagePresentationPatch(request);
      const current = this.page(pagePath);

      if (
        request.basePresentationVersion &&
        request.basePresentationVersion !== current.presentationVersion
      ) {
        return {
          status: "conflict" as const,
          presentation: current.presentation,
          currentPresentationVersion: current.presentationVersion,
          attemptedBasePresentationVersion: request.basePresentationVersion
        };
      }

      const imagePresentation: ImagePresentation = {
        ...current.presentation.images[imageSrc],
        ...patch
      };
      if (sameImagePresentation(current.presentation.images[imageSrc], imagePresentation)) {
        return { status: "saved" as const, changed: false, ...current };
      }

      const presentation: PagePresentation = {
        images: {
          ...current.presentation.images,
          [imageSrc]: imagePresentation
        }
      };
      const nextState: StoredPresentation = {
        schemaVersion: 1,
        pages: {
          ...this.state.pages,
          [pagePath]: presentation
        }
      };
      await this.persist(nextState);
      this.state = nextState;
      return {
        status: "saved" as const,
        changed: true,
        presentation: clonePagePresentation(presentation),
        presentationVersion: pagePresentationVersion(presentation)
      };
    });
  }

  pagesAtOrBelow(inputPath: string): PagePresentationSnapshot {
    const rootPath = normalizeWorkspacePath(inputPath);
    return Object.fromEntries(
      Object.entries(this.state.pages)
        .filter(([pagePath]) => isAtOrBelow(pagePath, rootPath))
        .map(([pagePath, presentation]) => [pagePath, clonePagePresentation(presentation)])
    );
  }

  async removePagesAtOrBelow(inputPath: string): Promise<void> {
    const rootPath = normalizeWorkspacePath(inputPath);
    await this.mutatePages((pages) => Object.fromEntries(
      Object.entries(pages).filter(([pagePath]) => !isAtOrBelow(pagePath, rootPath))
    ));
  }

  async restorePages(
    snapshot: PagePresentationSnapshot,
    previousRootPath: string,
    nextRootPath: string
  ): Promise<void> {
    const previousRoot = normalizeWorkspacePath(previousRootPath);
    const nextRoot = normalizeWorkspacePath(nextRootPath);
    await this.mutatePages((pages) => {
      const restored = { ...pages };
      for (const [pagePath, presentation] of Object.entries(snapshot)) {
        const restoredPath = movedPagePath(pagePath, previousRoot, nextRoot);
        if (restoredPath) restored[restoredPath] = clonePagePresentation(presentation);
      }
      return restored;
    });
  }

  async moveWorkspacePath(previousInput: string, nextInput: string): Promise<void> {
    const previousPath = normalizeWorkspacePath(previousInput);
    const nextPath = normalizeWorkspacePath(nextInput);
    if (previousPath === nextPath) return;

    await this.mutatePages((pages) => {
      const movedPages: Record<string, PagePresentation> = {};
      for (const [pagePath, presentation] of Object.entries(pages)) {
        const nextPagePath = movedPagePath(pagePath, previousPath, nextPath) ?? pagePath;
        const images = Object.fromEntries(
          Object.entries(presentation.images).map(([imageSrc, imagePresentation]) => [
            rewriteMarkdownReferenceTarget(
              imageSrc,
              previousPath,
              nextPath,
              nextPagePath
            ) ?? imageSrc,
            imagePresentation
          ])
        );
        movedPages[nextPagePath] = { images };
      }
      return movedPages;
    });
  }

  private async mutatePages(
    mutate: (pages: Readonly<Record<string, PagePresentation>>) => Record<string, PagePresentation>
  ): Promise<void> {
    await this.enqueue(async () => {
      const nextPages = mutate(this.state.pages);
      if (JSON.stringify(nextPages) === JSON.stringify(this.state.pages)) return;
      const nextState: StoredPresentation = { schemaVersion: 1, pages: nextPages };
      await this.persist(nextState);
      this.state = nextState;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(state: StoredPresentation): Promise<void> {
    const storagePath = path.join(this.rootPath, WORKSPACE_PRESENTATION_PATH);
    const directory = path.dirname(storagePath);
    const temporaryPath = `${storagePath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await fs.rename(temporaryPath, storagePath);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

function emptyStoredPresentation(): StoredPresentation {
  return { schemaVersion: 1, pages: {} };
}

function parseStoredPresentation(source: string): StoredPresentation {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid ${WORKSPACE_PRESENTATION_PATH}: ${errorMessage(error)}`);
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.pages)) {
    throw new Error(`Invalid ${WORKSPACE_PRESENTATION_PATH}: expected schema version 1`);
  }

  const pages: Record<string, PagePresentation> = {};
  for (const [pagePath, rawPresentation] of Object.entries(value.pages)) {
    const normalizedPath = normalizeWorkspacePath(pagePath);
    if (normalizedPath !== pagePath || !isRecord(rawPresentation) || !isRecord(rawPresentation.images)) {
      throw new Error(`Invalid ${WORKSPACE_PRESENTATION_PATH}: invalid page presentation`);
    }
    const images: PagePresentation["images"] = {};
    for (const [imageSrc, rawImage] of Object.entries(rawPresentation.images)) {
      if (!isRecord(rawImage)) {
        throw new Error(`Invalid ${WORKSPACE_PRESENTATION_PATH}: invalid image presentation`);
      }
      images[validateImageSource(imageSrc)] = parseImagePresentation(rawImage);
    }
    pages[pagePath] = { images };
  }
  return { schemaVersion: 1, pages };
}

function validateImageSource(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) {
    throw new Error("Image source must be a non-empty string of at most 4096 characters");
  }
  return value;
}

function validateImageWidth(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < MIN_IMAGE_PRESENTATION_WIDTH_PX ||
    value > MAX_IMAGE_PRESENTATION_WIDTH_PX
  ) {
    throw new Error(
      `Image width must be a whole number from ${MIN_IMAGE_PRESENTATION_WIDTH_PX} to ${MAX_IMAGE_PRESENTATION_WIDTH_PX} pixels`
    );
  }
  return value;
}

function validateImageAlignment(value: unknown): ImageAlignment {
  if (value !== "left" && value !== "center" && value !== "full") {
    throw new Error("Image alignment must be left, center, or full");
  }
  return value;
}

function imagePresentationPatch(
  request: UpdateImagePresentationRequest
): ImagePresentation {
  const patch: ImagePresentation = {};
  if (request.widthPx !== undefined) patch.widthPx = validateImageWidth(request.widthPx);
  if (request.alignment !== undefined) {
    patch.alignment = validateImageAlignment(request.alignment);
  }
  if (patch.widthPx === undefined && patch.alignment === undefined) {
    throw new Error("Image presentation update must include a width or alignment");
  }
  return patch;
}

function parseImagePresentation(rawImage: Record<string, unknown>): ImagePresentation {
  const presentation: ImagePresentation = {};
  if (rawImage.widthPx !== undefined) {
    presentation.widthPx = validateImageWidth(rawImage.widthPx);
  }
  if (rawImage.alignment !== undefined) {
    presentation.alignment = validateImageAlignment(rawImage.alignment);
  }
  if (presentation.widthPx === undefined && presentation.alignment === undefined) {
    throw new Error(`Invalid ${WORKSPACE_PRESENTATION_PATH}: empty image presentation`);
  }
  return presentation;
}

function sameImagePresentation(
  left: ImagePresentation | undefined,
  right: ImagePresentation
): boolean {
  return left?.widthPx === right.widthPx && left?.alignment === right.alignment;
}

function clonePagePresentation(presentation: PagePresentation): PagePresentation {
  return {
    images: Object.fromEntries(
      Object.entries(presentation.images).map(([imageSrc, image]) => [imageSrc, { ...image }])
    )
  };
}

function pagePresentationVersion(presentation: PagePresentation): string {
  const stablePresentation = {
    images: Object.fromEntries(
      Object.entries(presentation.images).sort(([left], [right]) => left.localeCompare(right))
    )
  };
  return createHash("sha256").update(JSON.stringify(stablePresentation)).digest("hex");
}

function isAtOrBelow(candidate: string, rootPath: string): boolean {
  return candidate === rootPath || candidate.startsWith(`${rootPath}/`);
}

function movedPath(candidate: string, previousPath: string, nextPath: string): string | null {
  if (candidate === previousPath) return nextPath;
  return candidate.startsWith(`${previousPath}/`)
    ? `${nextPath}${candidate.slice(previousPath.length)}`
    : null;
}

function movedPagePath(candidate: string, previousPath: string, nextPath: string): string | null {
  const previousName = path.posix.basename(previousPath);
  const nextName = path.posix.basename(nextPath);
  for (const suffix of [".index.md", ".db.md"]) {
    if (candidate === path.posix.join(previousPath, `${previousName}${suffix}`)) {
      return path.posix.join(nextPath, `${nextName}${suffix}`);
    }
  }
  return movedPath(candidate, previousPath, nextPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

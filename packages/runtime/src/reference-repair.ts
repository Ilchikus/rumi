import fs from "node:fs/promises";
import path from "node:path";
import {
  rewriteMarkdownReferences,
  type RewrittenReferences
} from "@rumi/markdown";
import {
  classifyFilePath,
  isHiddenFromTree,
  normalizeWorkspacePath
} from "@rumi/workspace-format";

export { rewriteMarkdownReferences, type RewrittenReferences };

export interface PlannedReferenceRepair {
  path: string;
  previousMarkdown: string;
  markdown: string;
  referenceCount: number;
}

export async function planWorkspaceReferenceRepairs(
  rootPath: string,
  previousPath: string,
  nextPath: string
): Promise<PlannedReferenceRepair[]> {
  const files = await collectMarkdownFiles(path.resolve(rootPath));
  const repairs: PlannedReferenceRepair[] = [];

  for (const relPath of files) {
    const absolutePath = path.join(rootPath, ...relPath.split("/"));
    const previousMarkdown = await fs.readFile(absolutePath, "utf8").catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    });
    if (previousMarkdown === null) continue;

    const rewritten = rewriteMarkdownReferences(previousMarkdown, previousPath, nextPath, relPath);
    if (rewritten.referenceCount > 0 && rewritten.markdown !== previousMarkdown) {
      repairs.push({
        path: relPath,
        previousMarkdown,
        markdown: rewritten.markdown,
        referenceCount: rewritten.referenceCount
      });
    }
  }

  return repairs;
}

async function collectMarkdownFiles(rootPath: string, relDirectory = ""): Promise<string[]> {
  const absoluteDirectory = relDirectory
    ? path.join(rootPath, ...relDirectory.split("/"))
    : rootPath;
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true }).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  });
  const files: string[] = [];

  for (const entry of entries) {
    const relPath = normalizeWorkspacePath(path.posix.join(relDirectory, entry.name));
    if (isHiddenFromTree(relPath)) continue;
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(rootPath, relPath));
      continue;
    }
    if (!entry.isFile()) continue;
    const kind = classifyFilePath(relPath);
    if (kind === "page" || kind === "folder-index" || kind === "database-config") {
      files.push(relPath);
    }
  }

  return files;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

import type { RumiApiClient } from "@rumi/api-client";
import type { DatabaseRefreshRevisions } from "../../database/databaseRefresh";

export interface MigratedEditorDocument {
  path: string;
  nodePath: string;
  title: string;
  kind: "workspace" | "folder" | "database" | "page";
}

export interface MigratedEditorPlatform {
  api?: RumiApiClient | undefined;
  databaseRefreshRevisions: DatabaseRefreshRevisions;
  workspaceKey: string;
  documentKey: string;
  documents: readonly MigratedEditorDocument[];
  openDocument?: ((path: string, target?: "current" | "new") => void) | undefined;
  uploadAsset?: ((file: File) => Promise<string>) | undefined;
  onMessage?: ((message: string) => void) | undefined;
}

let currentPlatform: MigratedEditorPlatform = {
  databaseRefreshRevisions: {},
  workspaceKey: "",
  documentKey: "",
  documents: []
};

const platformListeners = new Set<() => void>();

export function setMigratedEditorPlatform(platform: MigratedEditorPlatform): void {
  currentPlatform = platform;
  for (const listener of platformListeners) listener();
}

export function migratedEditorPlatform(): MigratedEditorPlatform {
  return currentPlatform;
}

export function subscribeMigratedEditorPlatform(listener: () => void): () => void {
  platformListeners.add(listener);
  return () => platformListeners.delete(listener);
}

export function workspaceAssetUrl(src: string): string {
  const trimmed = src.trim();
  if (/^[a-z][a-z\d+.-]*:/iu.test(trimmed) || trimmed.startsWith("//")) return trimmed;
  const suffixIndex = trimmed.search(/[?#]/u);
  const destination = suffixIndex < 0 ? trimmed : trimmed.slice(0, suffixIndex);
  const fragmentIndex = trimmed.indexOf("#");
  const fragment = fragmentIndex < 0 ? "" : trimmed.slice(fragmentIndex);
  const decoded = decodedWorkspacePath(destination);
  const rooted = decoded.startsWith("/") || decoded.startsWith(".assets/");
  const directory = currentPlatform.documentKey.split("/").slice(0, -1).join("/");
  const source = rooted ? decoded.replace(/^\/+/, "") : `${directory}/${decoded}`;
  const parts: string[] = [];
  for (const part of source.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return `/api/asset?${new URLSearchParams({ path: source }).toString()}`;
      parts.pop();
    }
    else parts.push(part);
  }
  return `/api/asset?${new URLSearchParams({ path: parts.join("/") }).toString()}${fragment}`;
}

// Markdown destinations are URLs: `image%20(1).png`, as written by asset renames
// and Obsidian, names the file `image (1).png`. A bare `%` is a literal one.
function decodedWorkspacePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function openEditorHref(
  href: string,
  target: "current" | "new" = "new"
): void {
  const trimmed = href.trim();
  if (!trimmed) return;
  if (/^https?:\/\//iu.test(trimmed)) {
    const opened = window.open(
      trimmed,
      target === "new" ? "_blank" : "_self",
      target === "new" ? "noopener,noreferrer" : undefined
    );
    if (target === "new") opened?.focus();
  } else if (trimmed.startsWith("#") && target === "current") {
    window.history.pushState(window.history.state, "", trimmed);
    window.dispatchEvent(new Event("rumi:heading-navigation"));
  } else {
    currentPlatform.openDocument?.(trimmed, target);
  }
}

export async function chooseAndUploadAsset(accept: string): Promise<string | null> {
  if (!currentPlatform.uploadAsset) return null;
  const file = await chooseFile(accept);
  return file ? currentPlatform.uploadAsset(file) : null;
}

export async function uploadEditorAsset(file: File): Promise<string | null> {
  return currentPlatform.uploadAsset ? currentPlatform.uploadAsset(file) : null;
}

export function reportEditorError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  currentPlatform.onMessage?.(message);
}

function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

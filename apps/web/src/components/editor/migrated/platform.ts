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
  openDocument?: ((path: string) => void) | undefined;
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
  return `/api/asset?${new URLSearchParams({ path: trimmed }).toString()}`;
}

export function openEditorHref(href: string): void {
  const trimmed = href.trim();
  if (!trimmed) return;
  if (/^https?:\/\//iu.test(trimmed)) {
    window.open(trimmed, "_blank", "noopener,noreferrer");
  } else {
    currentPlatform.openDocument?.(trimmed);
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

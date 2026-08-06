import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { EditorToolbarMode, WorkspaceSettings } from "@rumi/contracts";

export const WORKSPACE_CONFIG_PATH = ".rumi/config.json";
export const DEFAULT_ASSET_FILE_SIZE_MB = 50;
const BYTES_PER_MEGABYTE = 1024 * 1024;

export const SUPPORTED_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
  ".webm": "video/webm"
});

export interface WorkspaceAssetPolicy {
  maxFileSizeBytes: number | null;
  maxFileSizeMb: number | null;
  allowedFileTypes: readonly string[];
}

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  uploads: {
    maxFileSizeMb: DEFAULT_ASSET_FILE_SIZE_MB,
    allowedFileTypes: Object.keys(SUPPORTED_ASSET_CONTENT_TYPES)
  },
  editor: {
    highlightMisspellings: false,
    inlineReplacements: true,
    emojiSuggestions: true,
    inlineToolbar: "floating"
  }
};

export async function loadWorkspaceAssetPolicy(rootPath: string): Promise<WorkspaceAssetPolicy> {
  return workspaceAssetPolicyFromSettings(await loadWorkspaceSettings(rootPath));
}

export async function loadWorkspaceSettings(rootPath: string): Promise<WorkspaceSettings> {
  const config = await readWorkspaceConfig(rootPath);
  return workspaceSettingsFromConfig(config);
}

export async function saveWorkspaceSettings(
  rootPath: string,
  settings: WorkspaceSettings
): Promise<WorkspaceSettings> {
  const normalizedSettings = requireCompleteWorkspaceSettings(settings);
  const currentConfig = await readWorkspaceConfig(rootPath);
  const configPath = path.join(rootPath, WORKSPACE_CONFIG_PATH);
  const temporaryPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
  const nextConfig = {
    ...currentConfig,
    uploads: normalizedSettings.uploads,
    editor: normalizedSettings.editor
  };

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(nextConfig, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    await fs.rename(temporaryPath, configPath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }

  return normalizedSettings;
}

export function workspaceAssetPolicyFromSettings(
  settings: WorkspaceSettings
): WorkspaceAssetPolicy {
  const maxFileSizeMb = settings.uploads.maxFileSizeMb;
  return Object.freeze({
    maxFileSizeBytes: maxFileSizeMb === null ? null : maxFileSizeMb * BYTES_PER_MEGABYTE,
    maxFileSizeMb,
    allowedFileTypes: Object.freeze([...settings.uploads.allowedFileTypes])
  });
}

async function readWorkspaceConfig(rootPath: string): Promise<Record<string, unknown>> {
  const configPath = path.join(rootPath, WORKSPACE_CONFIG_PATH);
  const source = await fs.readFile(configPath, "utf8").catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  });

  if (source === null) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid ${WORKSPACE_CONFIG_PATH}: ${errorMessage(error)}`);
  }

  return requireObject(parsed, WORKSPACE_CONFIG_PATH);
}

function workspaceSettingsFromConfig(config: Record<string, unknown>): WorkspaceSettings {
  const uploads = "uploads" in config
    ? requireObject(config.uploads, `${WORKSPACE_CONFIG_PATH} uploads`)
    : {};
  const editor = "editor" in config
    ? requireObject(config.editor, `${WORKSPACE_CONFIG_PATH} editor`)
    : {};

  requireOnlyKeys(uploads, ["maxFileSizeMb", "allowedFileTypes"], `${WORKSPACE_CONFIG_PATH} uploads`);
  requireOnlyKeys(
    editor,
    ["highlightMisspellings", "inlineReplacements", "emojiSuggestions", "inlineToolbar"],
    `${WORKSPACE_CONFIG_PATH} editor`
  );

  const maxFileSizeMb = "maxFileSizeMb" in uploads
    ? requireMaxFileSizeMb(uploads.maxFileSizeMb)
    : DEFAULT_WORKSPACE_SETTINGS.uploads.maxFileSizeMb;
  const allowedFileTypes = "allowedFileTypes" in uploads
    ? requireAllowedFileTypes(uploads.allowedFileTypes)
    : DEFAULT_WORKSPACE_SETTINGS.uploads.allowedFileTypes;
  const highlightMisspellings = "highlightMisspellings" in editor
    ? requireBoolean(editor.highlightMisspellings, "editor.highlightMisspellings")
    : DEFAULT_WORKSPACE_SETTINGS.editor.highlightMisspellings;
  const inlineReplacements = "inlineReplacements" in editor
    ? requireBoolean(editor.inlineReplacements, "editor.inlineReplacements")
    : DEFAULT_WORKSPACE_SETTINGS.editor.inlineReplacements;
  const emojiSuggestions = "emojiSuggestions" in editor
    ? requireBoolean(editor.emojiSuggestions, "editor.emojiSuggestions")
    : DEFAULT_WORKSPACE_SETTINGS.editor.emojiSuggestions;
  const inlineToolbar = "inlineToolbar" in editor
    ? requireEditorToolbarMode(editor.inlineToolbar)
    : DEFAULT_WORKSPACE_SETTINGS.editor.inlineToolbar;

  return {
    uploads: {
      maxFileSizeMb,
      allowedFileTypes: [...allowedFileTypes]
    },
    editor: {
      highlightMisspellings,
      inlineReplacements,
      emojiSuggestions,
      inlineToolbar
    }
  };
}

function requireCompleteWorkspaceSettings(value: unknown): WorkspaceSettings {
  const settings = requireObject(value, "workspace settings");
  requireOnlyKeys(settings, ["uploads", "editor"], "workspace settings");

  if (!("uploads" in settings) || !("editor" in settings)) {
    throw new Error("Invalid workspace settings: uploads and editor settings are required");
  }

  return workspaceSettingsFromConfig(settings);
}

export function assetContentMatchesFileType(extension: string, data: Uint8Array): boolean {
  switch (extension) {
    case ".avif":
      return isAvif(data);
    case ".bmp":
      return hasAscii(data, 0, "BM");
    case ".gif":
      return hasAscii(data, 0, "GIF87a") || hasAscii(data, 0, "GIF89a");
    case ".ico":
      return hasBytes(data, [0x00, 0x00, 0x01, 0x00]);
    case ".jpeg":
    case ".jpg":
      return hasBytes(data, [0xff, 0xd8, 0xff]);
    case ".mp4":
      return isMp4(data);
    case ".pdf":
      return hasAscii(data, 0, "%PDF-");
    case ".png":
      return hasBytes(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case ".webp":
      return hasAscii(data, 0, "RIFF") && hasAscii(data, 8, "WEBP");
    case ".webm":
      return isWebm(data);
    default:
      return false;
  }
}

function requireMaxFileSizeMb(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(
      `Invalid ${WORKSPACE_CONFIG_PATH}: uploads.maxFileSizeMb must be a non-negative whole number or null`
    );
  }
  return value as number;
}

function requireAllowedFileTypes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${WORKSPACE_CONFIG_PATH}: uploads.allowedFileTypes must be an array`);
  }

  const normalized = value.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(
        `Invalid ${WORKSPACE_CONFIG_PATH}: uploads.allowedFileTypes[${index}] must be a file extension`
      );
    }
    const extension = entry.trim().toLowerCase();
    const dottedExtension = extension.startsWith(".") ? extension : `.${extension}`;
    if (!Object.hasOwn(SUPPORTED_ASSET_CONTENT_TYPES, dottedExtension)) {
      throw new Error(
        `Invalid ${WORKSPACE_CONFIG_PATH}: unsupported upload type ${JSON.stringify(entry)}`
      );
    }
    return dottedExtension;
  });

  return [...new Set(normalized)];
}

function requireBoolean(value: unknown, setting: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${WORKSPACE_CONFIG_PATH}: ${setting} must be a boolean`);
  }
  return value;
}

function requireEditorToolbarMode(value: unknown): EditorToolbarMode {
  if (value === "sticky") return "bottom";
  if (
    value === "floating"
    || value === "top"
    || value === "bottom"
    || value === "none"
  ) return value;
  throw new Error(
    `Invalid ${WORKSPACE_CONFIG_PATH}: editor.inlineToolbar must be floating, top, bottom, or none`
  );
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string
): void {
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (unknownKey) {
    throw new Error(`Invalid ${label}: unknown setting ${JSON.stringify(unknownKey)}`);
  }
}

function isAvif(data: Uint8Array): boolean {
  if (!hasAscii(data, 4, "ftyp") || data.byteLength < 16) return false;
  const boxLength = Math.min(readUint32(data, 0), data.byteLength);
  if (boxLength < 16) return false;

  for (let offset = 8; offset + 4 <= boxLength; offset += 4) {
    if (hasAscii(data, offset, "avif") || hasAscii(data, offset, "avis")) return true;
  }
  return false;
}

function isMp4(data: Uint8Array): boolean {
  if (!hasAscii(data, 4, "ftyp") || data.byteLength < 12) return false;
  const boxLength = Math.min(readUint32(data, 0), data.byteLength);
  if (boxLength < 12) return false;

  const mp4Brands = ["avc1", "iso2", "iso4", "iso5", "iso6", "isom", "M4V ", "mp41", "mp42"];
  for (let offset = 8; offset + 4 <= boxLength; offset += 4) {
    if (mp4Brands.some((brand) => hasAscii(data, offset, brand))) return true;
  }
  return false;
}

function isWebm(data: Uint8Array): boolean {
  if (!hasBytes(data, [0x1a, 0x45, 0xdf, 0xa3])) return false;
  const searchEnd = Math.min(data.byteLength, 4096);
  for (let offset = 4; offset + 4 <= searchEnd; offset += 1) {
    if (hasAscii(data, offset, "webm")) return true;
  }
  return false;
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) * 0x1000000) +
    ((data[offset + 1] ?? 0) << 16) +
    ((data[offset + 2] ?? 0) << 8) +
    (data[offset + 3] ?? 0)
  );
}

function hasBytes(data: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((byte, index) => data[index] === byte);
}

function hasAscii(data: Uint8Array, offset: number, expected: string): boolean {
  if (data.byteLength < offset + expected.length) return false;
  return [...expected].every((character, index) => data[offset + index] === character.charCodeAt(0));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

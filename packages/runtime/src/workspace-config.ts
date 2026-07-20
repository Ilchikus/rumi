import fs from "node:fs/promises";
import path from "node:path";

export const WORKSPACE_CONFIG_PATH = ".rumi/config.json";
export const MAX_ASSET_FILE_SIZE_MB = 50;

export const SUPPORTED_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp"
});

export interface WorkspaceAssetPolicy {
  maxFileSizeBytes: number;
  maxFileSizeMb: number;
  allowedFileTypes: readonly string[];
}

const DEFAULT_ASSET_POLICY: WorkspaceAssetPolicy = Object.freeze({
  maxFileSizeBytes: MAX_ASSET_FILE_SIZE_MB * 1024 * 1024,
  maxFileSizeMb: MAX_ASSET_FILE_SIZE_MB,
  allowedFileTypes: Object.freeze(Object.keys(SUPPORTED_ASSET_CONTENT_TYPES))
});

export async function loadWorkspaceAssetPolicy(rootPath: string): Promise<WorkspaceAssetPolicy> {
  const configPath = path.join(rootPath, WORKSPACE_CONFIG_PATH);
  const source = await fs.readFile(configPath, "utf8").catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  });

  if (source === null) return DEFAULT_ASSET_POLICY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid ${WORKSPACE_CONFIG_PATH}: ${errorMessage(error)}`);
  }

  const config = requireObject(parsed, WORKSPACE_CONFIG_PATH);
  requireOnlyKeys(config, ["uploads"], WORKSPACE_CONFIG_PATH);
  if (!("uploads" in config)) return DEFAULT_ASSET_POLICY;

  const uploads = requireObject(config.uploads, `${WORKSPACE_CONFIG_PATH} uploads`);
  requireOnlyKeys(uploads, ["maxFileSizeMb", "allowedFileTypes"], `${WORKSPACE_CONFIG_PATH} uploads`);

  const maxFileSizeMb = "maxFileSizeMb" in uploads
    ? requireMaxFileSizeMb(uploads.maxFileSizeMb)
    : DEFAULT_ASSET_POLICY.maxFileSizeMb;
  const allowedFileTypes = "allowedFileTypes" in uploads
    ? requireAllowedFileTypes(uploads.allowedFileTypes)
    : DEFAULT_ASSET_POLICY.allowedFileTypes;

  return Object.freeze({
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    maxFileSizeMb,
    allowedFileTypes: Object.freeze([...allowedFileTypes])
  });
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
    case ".pdf":
      return hasAscii(data, 0, "%PDF-");
    case ".png":
      return hasBytes(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case ".webp":
      return hasAscii(data, 0, "RIFF") && hasAscii(data, 8, "WEBP");
    default:
      return false;
  }
}

function requireMaxFileSizeMb(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_ASSET_FILE_SIZE_MB) {
    throw new Error(
      `Invalid ${WORKSPACE_CONFIG_PATH}: uploads.maxFileSizeMb must be an integer from 1 to ${MAX_ASSET_FILE_SIZE_MB}`
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
    const extension = entry.trim().toLocaleLowerCase();
    const dottedExtension = extension.startsWith(".") ? extension : `.${extension}`;
    if (!SUPPORTED_ASSET_CONTENT_TYPES[dottedExtension]) {
      throw new Error(
        `Invalid ${WORKSPACE_CONFIG_PATH}: unsupported upload type ${JSON.stringify(entry)}`
      );
    }
    return dottedExtension;
  });

  return [...new Set(normalized)];
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

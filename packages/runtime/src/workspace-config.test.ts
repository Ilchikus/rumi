import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assetContentMatchesFileType,
  loadWorkspaceAssetPolicy,
  MAX_ASSET_FILE_SIZE_MB,
  SUPPORTED_ASSET_CONTENT_TYPES,
  WORKSPACE_CONFIG_PATH
} from "./workspace-config";

const cleanupPaths: string[] = [];

afterEach(async () => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    await fs.rm(cleanupPath, { recursive: true, force: true });
  }
});

describe("workspace upload configuration", () => {
  it("uses safe defaults and normalizes configured file extensions", async () => {
    const defaultRoot = await tempWorkspace();
    const defaultPolicy = await loadWorkspaceAssetPolicy(defaultRoot);

    expect(defaultPolicy).toEqual({
      maxFileSizeBytes: MAX_ASSET_FILE_SIZE_MB * 1024 * 1024,
      maxFileSizeMb: MAX_ASSET_FILE_SIZE_MB,
      allowedFileTypes: Object.keys(SUPPORTED_ASSET_CONTENT_TYPES)
    });

    const configuredRoot = await tempWorkspace();
    await writeConfig(configuredRoot, {
      revisions: { retentionDays: 30 },
      uploads: {
        maxFileSizeMb: 2,
        allowedFileTypes: ["PNG", ".jpg", ".PNG"]
      }
    });

    await expect(loadWorkspaceAssetPolicy(configuredRoot)).resolves.toEqual({
      maxFileSizeBytes: 2 * 1024 * 1024,
      maxFileSizeMb: 2,
      allowedFileTypes: [".png", ".jpg"]
    });

    const disabledRoot = await tempWorkspace();
    await writeConfig(disabledRoot, { uploads: { allowedFileTypes: [] } });
    await expect(loadWorkspaceAssetPolicy(disabledRoot)).resolves.toMatchObject({
      allowedFileTypes: []
    });
  });

  it("rejects malformed, misspelled, out-of-range, and unsupported policies", async () => {
    const root = await tempWorkspace();
    const configPath = path.join(root, WORKSPACE_CONFIG_PATH);
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    const invalidPolicies: Array<{ source: string; message: RegExp }> = [
      { source: "{", message: /Invalid \.rumi\/config\.json/u },
      {
        source: JSON.stringify({ uploads: { maxFileSizeMb: 0 } }),
        message: /must be an integer from 1 to 50/u
      },
      {
        source: JSON.stringify({ uploads: { allowedTypes: [".png"] } }),
        message: /unknown setting "allowedTypes"/u
      },
      {
        source: JSON.stringify({ uploads: { allowedFileTypes: [".svg"] } }),
        message: /unsupported upload type/u
      }
    ];

    for (const policy of invalidPolicies) {
      await fs.writeFile(configPath, policy.source, "utf8");
      await expect(loadWorkspaceAssetPolicy(root)).rejects.toThrow(policy.message);
    }
  });

  it("recognizes each supported file signature and rejects mismatched content", () => {
    const signatures: Record<string, Uint8Array> = {
      ".avif": Buffer.from([
        0, 0, 0, 20,
        102, 116, 121, 112,
        97, 118, 105, 102,
        0, 0, 0, 0,
        97, 118, 105, 102
      ]),
      ".bmp": Buffer.from("BM"),
      ".gif": Buffer.from("GIF89a"),
      ".ico": Buffer.from([0, 0, 1, 0]),
      ".jpeg": Buffer.from([0xff, 0xd8, 0xff]),
      ".jpg": Buffer.from([0xff, 0xd8, 0xff]),
      ".pdf": Buffer.from("%PDF-"),
      ".png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ".webp": Buffer.from("RIFF0000WEBP")
    };

    expect(Object.keys(signatures)).toEqual(Object.keys(SUPPORTED_ASSET_CONTENT_TYPES));
    for (const [extension, signature] of Object.entries(signatures)) {
      expect(assetContentMatchesFileType(extension, signature), extension).toBe(true);
      expect(assetContentMatchesFileType(extension, Buffer.from("not the declared file")), extension).toBe(false);
    }
  });
});

async function tempWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rumi-workspace-config-"));
  cleanupPaths.push(root);
  return root;
}

async function writeConfig(root: string, config: unknown): Promise<void> {
  const configPath = path.join(root, WORKSPACE_CONFIG_PATH);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config), "utf8");
}

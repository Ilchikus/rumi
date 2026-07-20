import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceRoots = [join(repositoryRoot, "apps"), join(repositoryRoot, "packages")];

describe("web platform boundary", () => {
  it("keeps production source free of Electron packages and bridge APIs", () => {
    const forbidden = [
      { name: "Electron package import", pattern: /(?:from\s+|import\s*\(|require\s*\()\s*["']electron(?:\/[^"']*)?["']/u },
      { name: "Electron renderer bridge", pattern: /\b(?:ipcRenderer|ipcMain|contextBridge|electronAPI|BrowserWindow)\b/u },
      { name: "legacy renderer import", pattern: /src\/renderer/u }
    ];
    const violations: string[] = [];

    for (const file of sourceRoots.flatMap(productionSourceFiles)) {
      const source = readFileSync(file, "utf8");
      for (const rule of forbidden) {
        if (rule.pattern.test(source)) {
          violations.push(`${relative(repositoryRoot, file)}: ${rule.name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not declare an Electron runtime in active package manifests", () => {
    const manifests = packageManifests(repositoryRoot)
      .map((path) => ({ path, manifest: JSON.parse(readFileSync(path, "utf8")) as PackageManifest }));
    const violations = manifests.flatMap(({ path, manifest }) => {
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies
      };

      return Object.keys(dependencies)
        .filter((name) => name === "electron" || name.startsWith("electron-"))
        .map((name) => `${relative(repositoryRoot, path)}: ${name}`);
    });

    expect(violations).toEqual([]);
  });

  it("does not publish routine success operations as interface notifications", () => {
    const successNotification = /(?:setMessage|onMessage)\(\s*(?:`(?:Created|Uploaded|Renamed|Moved|Restored)|"(?:Snapshot created|Revision restored|Page refreshed from server))/u;
    const violations = sourceRoots
      .flatMap(productionSourceFiles)
      .filter((file) => successNotification.test(readFileSync(file, "utf8")))
      .map((file) => relative(repositoryRoot, file));

    expect(violations).toEqual([]);
  });
});

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(entry.name))) return [];
    if (/\.(?:test|spec)\.[^.]+$/u.test(entry.name)) return [];
    return [path];
  });
}

function packageManifests(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", ".git"].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return packageManifests(path);
    return entry.name === "package.json" ? [path] : [];
  });
}

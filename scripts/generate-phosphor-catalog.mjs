import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const PHOSPHOR_VERSION = "2.1.1";
const TARBALL_URL =
  `https://registry.npmjs.org/@phosphor-icons/core/-/core-${PHOSPHOR_VERSION}.tgz`;
const OUTPUT_URL = new URL(
  "../apps/web/src/components/icons/phosphor-catalog.generated.json",
  import.meta.url
);

const workDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "rumi-phosphor-"));

try {
  const tarballPath = path.join(workDirectory, "core.tgz");
  const response = await fetch(TARBALL_URL);
  if (!response.ok) throw new Error(`Failed to download ${TARBALL_URL}: ${response.status}`);
  await fs.writeFile(tarballPath, Buffer.from(await response.arrayBuffer()));
  await promisify(execFile)("tar", ["xzf", tarballPath, "-C", workDirectory]);

  const packageRoot = path.join(workDirectory, "package");
  const { icons } = await import(pathToFileURL(path.join(packageRoot, "dist", "index.mjs")).href);
  const entries = [];

  for (const icon of [...icons].sort((left, right) => left.name.localeCompare(right.name))) {
    const svg = await fs.readFile(path.join(packageRoot, "assets", "regular", `${icon.name}.svg`), "utf8");
    const paths = [...svg.matchAll(/<path d="([^"]+)"\s*\/>/gu)];
    if (paths.length !== 1 || !svg.includes('viewBox="0 0 256 256"')) {
      throw new Error(`Unexpected regular SVG shape for ${icon.name}`);
    }
    const tags = icon.tags.filter((tag) => !tag.startsWith("*")).join(" ");
    entries.push([icon.name, tags, paths[0][1]]);
  }

  const catalog = {
    source: `@phosphor-icons/core ${PHOSPHOR_VERSION}, regular weight`,
    license: "MIT License, Copyright (c) 2023 Phosphor Icons",
    viewBox: "0 0 256 256",
    icons: entries
  };
  await fs.writeFile(OUTPUT_URL, `${JSON.stringify(catalog)}\n`, "utf8");
  console.log(`Wrote ${entries.length} Phosphor icons to ${OUTPUT_URL.pathname}`);
} finally {
  await fs.rm(workDirectory, { recursive: true, force: true });
}

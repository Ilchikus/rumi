import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const cliRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const outputRoot = path.join(cliRoot, "dist");
const webBuildRoot = path.join(repositoryRoot, "apps/web/dist");
const packageJson = JSON.parse(
  await fs.readFile(path.join(cliRoot, "package.json"), "utf8")
);

const webIndex = await fs.stat(path.join(webBuildRoot, "index.html")).catch(() => null);
if (!webIndex?.isFile()) {
  throw new Error("The official web client must be built before the CLI bundle");
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

await build({
  entryPoints: [path.join(cliRoot, "src/index.ts")],
  outfile: path.join(outputRoot, "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  sourcemap: true,
  legalComments: "none",
  alias: {
    "@rumi/contracts": path.join(repositoryRoot, "packages/contracts/src/index.ts"),
    "@rumi/markdown": path.join(repositoryRoot, "packages/markdown/src/index.ts"),
    "@rumi/runtime": path.join(repositoryRoot, "packages/runtime/src/index.ts"),
    "@rumi/server": path.join(repositoryRoot, "apps/server/src/server.ts"),
    "@rumi/workspace-format": path.join(repositoryRoot, "packages/workspace-format/src/index.ts")
  }
});

await fs.chmod(path.join(outputRoot, "index.js"), 0o755);
await fs.cp(webBuildRoot, path.join(outputRoot, "web"), { recursive: true });

console.log(`Built ${packageJson.name} ${packageJson.version}`);

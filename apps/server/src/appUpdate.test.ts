import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempWorkspace } from "@rumi/runtime";
import { compareVersions, type RumiAppOptions } from "./appUpdate";
import { createRumiServer, type CreateRumiServerOptions } from "./server";

const cleanupPaths: string[] = [];

afterEach(async () => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    await fs.rm(cleanupPath, { recursive: true, force: true });
  }
});

async function globalInstall(): Promise<{ globalRoot: string; entryPath: string }> {
  const globalRoot = await createTempWorkspace("rumi-npm-global-");
  cleanupPaths.push(globalRoot);
  const entryPath = path.join(globalRoot, "@rumi-md", "server", "dist", "index.js");
  await fs.mkdir(path.dirname(entryPath), { recursive: true });
  await fs.writeFile(entryPath, "", "utf8");
  return { globalRoot, entryPath };
}

async function serverWith(
  app: Partial<RumiAppOptions> | undefined,
  options: Partial<CreateRumiServerOptions> = {}
) {
  const root = await createTempWorkspace("rumi-app-update-");
  cleanupPaths.push(root);
  const { server } = await createRumiServer({
    workspacePath: root,
    logLevel: "silent",
    ...options,
    ...(app ? { app: { version: "0.1.17", ...app } } : {})
  });
  return server;
}

describe("version comparison", () => {
  it("orders numeric versions and never treats prereleases as newer", () => {
    expect(compareVersions("0.1.18", "0.1.17")).toBe(1);
    expect(compareVersions("0.2.0", "0.1.99")).toBe(1);
    expect(compareVersions("0.1.17", "0.1.17")).toBe(0);
    expect(compareVersions("0.1.16", "0.1.17")).toBe(-1);
    expect(compareVersions("0.1.18-beta.1", "0.1.17")).toBe(0);
    expect(compareVersions("0.2.0", "0.2.0-beta.1")).toBe(1);
    expect(compareVersions("0.2.0-beta.1", "0.2.0")).toBe(-1);
    expect(compareVersions("not-a-version", "0.1.17")).toBe(0);
  });

});

describe("app version API", () => {
  it("reports development servers and disabled checks without contacting the registry", async () => {
    const fetchLatestVersion = vi.fn(async () => "9.9.9");
    const development = await serverWith(undefined);
    const disabled = await serverWith({ updateCheck: false, fetchLatestVersion });

    expect((await development.inject({ method: "GET", url: "/api/app" })).json()).toEqual({
      version: null,
      latestVersion: null,
      updateAvailable: false,
      update: { mode: "disabled" }
    });
    expect((await disabled.inject({ method: "GET", url: "/api/app" })).json()).toMatchObject({
      version: "0.1.17",
      updateAvailable: false,
      update: { mode: "disabled" }
    });
    expect(fetchLatestVersion).not.toHaveBeenCalled();
    await Promise.all([development.close(), disabled.close()]);
  });

  it("offers self-update for a loopback global install and caches the registry answer", async () => {
    const { globalRoot, entryPath } = await globalInstall();
    const fetchLatestVersion = vi.fn(async () => "0.1.18");
    const server = await serverWith({
      entryPath,
      fetchLatestVersion,
      globalPackageRoot: async () => globalRoot
    });

    const first = await server.inject({ method: "GET", url: "/api/app" });
    const second = await server.inject({ method: "GET", url: "/api/app" });

    expect(first.json()).toEqual({
      version: "0.1.17",
      latestVersion: "0.1.18",
      updateAvailable: true,
      update: { mode: "self" }
    });
    expect(second.json()).toEqual(first.json());
    expect(fetchLatestVersion).toHaveBeenCalledTimes(1);
    await server.close();
  });

  it("falls back to a manual command for npx, other installs, and proxied requests without auth", async () => {
    const { globalRoot, entryPath } = await globalInstall();
    const latest = { fetchLatestVersion: async () => "0.1.18", globalPackageRoot: async () => globalRoot };
    const npx = await serverWith({
      ...latest,
      entryPath: "/home/user/.npm/_npx/abc123/node_modules/@rumi-md/server/dist/index.js"
    });
    const source = await serverWith({ ...latest, entryPath: "/srv/rumi/apps/cli/src/index.ts" });
    const exposed = await serverWith({ ...latest, entryPath });
    const tunneled = {
      "x-forwarded-for": "203.0.113.9",
      "x-forwarded-proto": "https",
      "cf-connecting-ip": "203.0.113.9"
    };

    expect((await npx.inject({ method: "GET", url: "/api/app" })).json().update).toEqual({
      mode: "manual",
      command: "npx @rumi-md/server@latest serve"
    });
    expect((await source.inject({ method: "GET", url: "/api/app" })).json().update).toEqual({
      mode: "manual",
      command: "npm install --global @rumi-md/server@latest"
    });
    expect((await exposed.inject({ method: "GET", url: "/api/app" })).json().update.mode)
      .toBe("self");
    expect((await exposed.inject({ method: "GET", url: "/api/app", headers: tunneled })).json().update.mode)
      .toBe("manual");
    expect((await exposed.inject({
      method: "GET",
      url: "/api/app",
      headers: { "x-rumi-client-address": "127.0.0.1" }
    })).json().update.mode).toBe("manual");
    expect((await exposed.inject({ method: "POST", url: "/api/app/update", headers: tunneled })).statusCode)
      .toBe(409);
    await Promise.all([npx.close(), source.close(), exposed.close()]);
  });

  it("keeps quiet when the registry is unreachable or behind", async () => {
    const offline = await serverWith({ fetchLatestVersion: async () => { throw new Error("offline"); } });
    const behind = await serverWith({ fetchLatestVersion: async () => "0.1.16" });

    expect((await offline.inject({ method: "GET", url: "/api/app" })).json()).toMatchObject({
      latestVersion: null,
      updateAvailable: false
    });
    expect((await behind.inject({ method: "GET", url: "/api/app" })).json()).toMatchObject({
      latestVersion: "0.1.16",
      updateAvailable: false
    });
    await Promise.all([offline.close(), behind.close()]);
  });

  it("installs the advertised version and restarts only after replying", async () => {
    const { globalRoot, entryPath } = await globalInstall();
    const events: string[] = [];
    const server = await serverWith({
      entryPath,
      fetchLatestVersion: async () => "0.1.18",
      globalPackageRoot: async () => globalRoot,
      installVersion: async (version) => {
        events.push(`install ${version}`);
      },
      restart: () => events.push("restart")
    });

    const response = await server.inject({ method: "POST", url: "/api/app/update" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "restarting", version: "0.1.18" });
    await vi.waitFor(() => expect(events).toEqual(["install 0.1.18", "restart"]));
    await server.close();
  });

  it("installs and restarts once for concurrent and repeated update requests", async () => {
    const { globalRoot, entryPath } = await globalInstall();
    const installVersion = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const restart = vi.fn();
    const server = await serverWith({
      entryPath,
      fetchLatestVersion: async () => "0.1.18",
      globalPackageRoot: async () => globalRoot,
      installVersion,
      restart
    });

    const responses = await Promise.all([
      server.inject({ method: "POST", url: "/api/app/update" }),
      server.inject({ method: "POST", url: "/api/app/update" })
    ]);
    const later = await server.inject({ method: "POST", url: "/api/app/update" });

    expect([...responses, later].map((response) => response.statusCode)).toEqual([200, 200, 200]);
    expect(installVersion).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(restart).toHaveBeenCalled());
    expect(restart).toHaveBeenCalledTimes(1);
    await server.close();
  });

  it("reports a failed install with the manual command and keeps serving", async () => {
    const { globalRoot, entryPath } = await globalInstall();
    const restart = vi.fn();
    const server = await serverWith({
      entryPath,
      fetchLatestVersion: async () => "0.1.18",
      globalPackageRoot: async () => globalRoot,
      installVersion: async () => {
        throw new Error("npm error code EACCES\nnpm error permission denied");
      },
      restart
    });

    const response = await server.inject({ method: "POST", url: "/api/app/update" });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatchObject({
      code: "update_failed",
      command: "npm install --global @rumi-md/server@latest"
    });
    expect(response.json().error.message).toContain("EACCES");
    expect(restart).not.toHaveBeenCalled();
    expect((await server.inject({ method: "GET", url: "/api/tree" })).statusCode).toBe(200);
    await server.close();
  });
});

import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempWorkspace } from "@rumi/runtime";
import { resolveAuthStatePath, setLocalPassword } from "./auth";
import { createRumiServer } from "./server";

const cleanupPaths: string[] = [];
const USERNAME = "illcheck";
const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "new correct horse battery staple";

afterEach(async () => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    await fs.rm(cleanupPath, { recursive: true, force: true });
  }
});

describe("Rumi instance authentication", () => {
  it("keeps existing API behavior in none mode", async () => {
    const root = await tempWorkspace();
    const { server } = await createRumiServer({ workspacePath: root, auth: { mode: "none" } });

    const sessionResponse = await server.inject({ method: "GET", url: "/api/auth/session" });
    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toEqual({ mode: "none", authenticated: true });

    const treeResponse = await server.inject({ method: "GET", url: "/api/tree" });
    expect(treeResponse.statusCode).toBe(200);

    await server.close();
  });

  it("fails closed when password mode has no configured credential", async () => {
    const root = await tempWorkspace();
    const statePath = await tempAuthStatePath(root);

    await expect(
      createRumiServer({ workspacePath: root, auth: { mode: "password", statePath } })
    ).rejects.toThrow("Password authentication is not configured");
  });

  it("protects APIs and SSE with an opaque server-side session", async () => {
    const root = await tempWorkspace();
    const statePath = await tempAuthStatePath(root);
    await setLocalPassword({ workspacePath: root, statePath, username: USERNAME, password: PASSWORD });
    const { server } = await createRumiServer({
      workspacePath: root,
      auth: { mode: "password", statePath }
    });

    const anonymousSession = await server.inject({ method: "GET", url: "/api/auth/session" });
    expect(anonymousSession.json()).toEqual({ mode: "password", authenticated: false });
    expect((await server.inject({ method: "GET", url: "/api/tree" })).statusCode).toBe(401);
    expect((await server.inject({ method: "GET", url: "/api/events" })).statusCode).toBe(401);

    const invalidLogin = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: USERNAME, password: "not the password" }
    });
    expect(invalidLogin.statusCode).toBe(401);
    expect(invalidLogin.json()).toMatchObject({ error: { code: "invalid_credentials" } });

    const crossOriginLogin = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        origin: "https://attacker.example",
        host: "dev-docs.rumi.md",
        "sec-fetch-site": "cross-site"
      },
      payload: { username: USERNAME, password: PASSWORD }
    });
    expect(crossOriginLogin.statusCode).toBe(403);

    const login = await loginRequest(server, PASSWORD);
    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({
      mode: "password",
      authenticated: true,
      user: { username: USERNAME }
    });

    const setCookieHeader = login.headers["set-cookie"];
    const setCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    expect(setCookie).toContain("rumi_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");
    const cookie = setCookie!.split(";", 1)[0]!;
    const rawToken = cookie.slice(cookie.indexOf("=") + 1);

    const authenticatedSession = await server.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie }
    });
    expect(authenticatedSession.json()).toMatchObject({
      authenticated: true,
      user: { username: USERNAME }
    });
    expect(
      (await server.inject({ method: "GET", url: "/api/tree", headers: { cookie } })).statusCode
    ).toBe(200);

    const storedState = await fs.readFile(statePath, "utf8");
    expect(storedState).not.toContain(PASSWORD);
    expect(storedState).not.toContain(rawToken);
    expect((await fs.stat(statePath)).mode & 0o777).toBe(0o600);

    const logout = await server.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie,
        origin: "https://dev-docs.rumi.md",
        "x-forwarded-host": "dev-docs.rumi.md",
        "x-forwarded-proto": "https"
      }
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.headers["set-cookie"]).toContain("Max-Age=0");
    expect(
      (await server.inject({ method: "GET", url: "/api/tree", headers: { cookie } })).statusCode
    ).toBe(401);

    await server.close();
  });

  it("invalidates every session when the host owner resets the password", async () => {
    const root = await tempWorkspace();
    const statePath = await tempAuthStatePath(root);
    await setLocalPassword({ workspacePath: root, statePath, username: USERNAME, password: PASSWORD });
    const { server } = await createRumiServer({
      workspacePath: root,
      auth: { mode: "password", statePath }
    });
    const login = await loginRequest(server, PASSWORD);
    const setCookieHeader = login.headers["set-cookie"];
    const setCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    const cookie = setCookie!.split(";", 1)[0]!;

    await setLocalPassword({
      workspacePath: root,
      statePath,
      username: USERNAME,
      password: NEW_PASSWORD
    });

    expect(
      (await server.inject({ method: "GET", url: "/api/tree", headers: { cookie } })).statusCode
    ).toBe(401);
    expect((await loginRequest(server, PASSWORD)).statusCode).toBe(401);
    expect((await loginRequest(server, NEW_PASSWORD)).statusCode).toBe(200);

    await server.close();
  });

  it("throttles repeated login guesses", async () => {
    const root = await tempWorkspace();
    const statePath = await tempAuthStatePath(root);
    await setLocalPassword({ workspacePath: root, statePath, username: USERNAME, password: PASSWORD });
    const { server } = await createRumiServer({
      workspacePath: root,
      auth: { mode: "password", statePath }
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "someone-else", password: PASSWORD }
      });
      expect(response.statusCode).toBe(401);
    }

    const throttled = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: USERNAME, password: PASSWORD }
    });
    expect(throttled.statusCode).toBe(429);
    expect(throttled.headers["retry-after"]).toBe("60");

    await server.close();
  });

  it("throttles direct Cloudflare Tunnel clients independently behind loopback", async () => {
    const root = await tempWorkspace();
    const statePath = await tempAuthStatePath(root);
    await setLocalPassword({ workspacePath: root, statePath, username: USERNAME, password: PASSWORD });
    const { server } = await createRumiServer({
      workspacePath: root,
      auth: { mode: "password", statePath }
    });
    const tunnelHeaders = {
      origin: "https://dev-docs.rumi.md",
      "x-forwarded-host": "dev-docs.rumi.md",
      "x-forwarded-proto": "https"
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { ...tunnelHeaders, "cf-connecting-ip": "198.51.100.10" },
        payload: { username: "someone-else", password: PASSWORD }
      });
      expect(response.statusCode).toBe(401);
    }

    const otherClient = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { ...tunnelHeaders, "cf-connecting-ip": "198.51.100.11" },
      payload: { username: USERNAME, password: PASSWORD }
    });
    expect(otherClient.statusCode).toBe(200);

    await server.close();
  });

  it("refuses to send a password over non-loopback HTTP", async () => {
    const root = await tempWorkspace();
    const statePath = await tempAuthStatePath(root);
    await setLocalPassword({ workspacePath: root, statePath, username: USERNAME, password: PASSWORD });
    const { server } = await createRumiServer({
      workspacePath: root,
      auth: { mode: "password", statePath }
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        origin: "http://192.168.1.41:4173",
        "x-forwarded-host": "192.168.1.41:4173",
        "x-forwarded-proto": "http",
        "x-rumi-client-address": "192.168.1.35"
      },
      payload: { username: USERNAME, password: PASSWORD }
    });

    expect(response.statusCode).toBe(426);
    expect(response.json()).toMatchObject({ error: { code: "secure_transport_required" } });

    await server.close();
  });
});

async function tempWorkspace(): Promise<string> {
  const root = await createTempWorkspace("rumi-auth-");
  cleanupPaths.push(root);
  return root;
}

async function tempAuthStatePath(workspacePath: string): Promise<string> {
  const directory = `${workspacePath}-auth`;
  cleanupPaths.push(directory);
  return resolveAuthStatePath(workspacePath, path.join(directory, "auth.json"));
}

function loginRequest(server: Awaited<ReturnType<typeof createRumiServer>>["server"], password: string) {
  return server.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: {
      origin: "https://dev-docs.rumi.md",
      "x-forwarded-host": "dev-docs.rumi.md",
      "x-forwarded-proto": "https"
    },
    payload: { username: USERNAME, password }
  });
}

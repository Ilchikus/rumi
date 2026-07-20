import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import fs from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import type {
  AuthLoginRequest,
  AuthSessionResult,
  CheckpointRequest,
  ChangeDatabasePropertyTypeRequest,
  CreateDatabasePropertyOptionRequest,
  CreateDatabaseRecordRequest,
  CreateDatabaseRequest,
  CreateFolderRequest,
  CreatePageRequest,
  DeleteNodeRequest,
  DeleteDatabasePropertyRequest,
  MoveNodeRequest,
  QueryDatabaseRequest,
  RenameDatabasePropertyRequest,
  RenameNodeRequest,
  RestoreTrashItemRequest,
  RestoreRevisionRequest,
  RumiEventEnvelope,
  SavePageRequest,
  SaveAssetResult,
  SearchWorkspaceRequest,
  UpdateDatabaseRecordPropertyRequest,
  UpdateDatabasePropertyOptionRequest,
  UpdateDatabaseSchemaRequest
} from "@rumi/contracts";
import { WorkspaceRuntime } from "@rumi/runtime";
import { LocalPasswordAuth, type RumiAuthOptions } from "./auth";

const SESSION_COOKIE_NAME = "rumi_session";
const PUBLIC_AUTH_PATHS = new Set([
  "/api/auth/session",
  "/api/auth/login",
  "/api/auth/logout"
]);
const WEB_SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'none'"
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-permitted-cross-domain-policies": "none"
} as const;

export interface CreateRumiServerOptions {
  workspacePath: string;
  logLevel?: RumiLogLevel;
  prettyLogs?: boolean;
  auth?: RumiAuthOptions;
  webRoot?: string | false;
}

export interface StartRumiServerOptions extends CreateRumiServerOptions {
  host?: string;
  port?: number;
}

export interface StartedRumiServer {
  server: FastifyInstance;
  runtime: WorkspaceRuntime;
  url: string;
}

export type RumiLogLevel = "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export async function createRumiServer(options: CreateRumiServerOptions): Promise<StartedRumiServer> {
  const authOptions = options.auth ?? { mode: "none" };
  const passwordAuth =
    authOptions.mode === "password"
      ? await LocalPasswordAuth.open({
          workspacePath: options.workspacePath,
          ...(authOptions.statePath ? { statePath: authOptions.statePath } : {}),
          ...(authOptions.sessionTtlMs ? { sessionTtlMs: authOptions.sessionTtlMs } : {})
        })
      : null;
  const loginThrottle = new LoginThrottle();
  const runtime = await WorkspaceRuntime.open({ rootPath: options.workspacePath });
  await runtime.startWatchingWorkspace();
  const closeEventStreams = new Set<() => void>();
  const server = Fastify({
    logger:
      options.logLevel === "silent"
        ? false
        : {
            level: options.logLevel ?? "warn",
            ...(options.prettyLogs
              ? {
                  transport: {
                    target: "pino-pretty",
                    options: {
                      colorize: true,
                      translateTime: "HH:MM:ss",
                      ignore: "pid,hostname,reqId,req,res,responseTime"
                    }
                  }
                }
              : {})
          },
    disableRequestLogging: true
  });
  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: runtime.assetPolicy.maxFileSizeBytes },
    (_request, body, done) => done(null, body)
  );
  const webRoot = await resolveWebRoot(options.webRoot);

  if (webRoot) {
    await server.register(fastifyStatic, {
      root: webRoot,
      prefix: "/",
      maxAge: "30d",
      immutable: true
    });
    server.get("/", (request, reply) => {
      reply.header("cache-control", "no-cache");
      return reply.sendFile("index.html", { cacheControl: false });
    });
  }

  server.setErrorHandler((error: Error, _request, reply) => {
    _request.log.error({ err: error }, "request.error");
    const statusCode = errorStatusCode(error);
    reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? "internal_error" : "invalid_request",
        message: statusCode >= 500 ? "Internal server error" : error.message
      }
    });
  });

  server.addHook("preClose", async () => {
    for (const closeStream of [...closeEventStreams]) {
      closeStream();
    }
  });

  server.addHook("onClose", async () => {
    await runtime.stopWatchingWorkspace();
  });

  server.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) {
      reply.header("cache-control", "private, no-store");
      reply.header("x-content-type-options", "nosniff");
    } else if (webRoot) {
      for (const [name, value] of Object.entries(WEB_SECURITY_HEADERS)) {
        reply.header(name, value);
      }
    }

    return payload;
  });

  server.addHook("onRequest", async (request, reply) => {
    const requestPath = request.url.split("?", 1)[0] ?? request.url;

    if (!requestPath.startsWith("/api/")) {
      return;
    }

    if (!isSafeMethod(request.method) && !isSameOriginRequest(request)) {
      return reply.status(403).send({
        error: {
          code: "cross_origin_request",
          message: "Cross-origin API requests are not allowed"
        }
      });
    }

    if (authOptions.mode === "none" || PUBLIC_AUTH_PATHS.has(requestPath)) {
      return;
    }

    const username = await passwordAuth!.authenticate(readSessionCookie(request));

    if (!username) {
      return reply.status(401).send({
        error: {
          code: "authentication_required",
          message: "Authentication required"
        }
      });
    }
  });

  server.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/") || !webRoot || request.method !== "GET") {
      return reply.status(404).send({
        error: { code: "not_found", message: "Route not found" }
      });
    }

    reply.header("cache-control", "no-cache");
    return reply.sendFile("index.html", { cacheControl: false });
  });

  server.get("/api/auth/session", async (request, reply): Promise<AuthSessionResult> => {
    reply.header("cache-control", "no-store");

    if (authOptions.mode === "none") {
      return {
        mode: "none",
        authenticated: true
      };
    }

    const username = await passwordAuth!.authenticate(readSessionCookie(request));

    return username
      ? {
          mode: "password",
          authenticated: true,
          user: { username }
        }
      : {
          mode: "password",
          authenticated: false
        };
  });

  server.post<{ Body: AuthLoginRequest | unknown }>("/api/auth/login", async (request, reply) => {
    reply.header("cache-control", "no-store");

    if (authOptions.mode !== "password") {
      return reply.status(400).send({
        error: {
          code: "password_auth_disabled",
          message: "Password authentication is not enabled"
        }
      });
    }

    if (!isLoginRequest(request.body)) {
      return reply.status(400).send({
        error: {
          code: "invalid_login_request",
          message: "Username and password are required"
        }
      });
    }

    if (!isSecureRequest(request) && !isLoopbackProxyRequest(request)) {
      return reply.status(426).send({
        error: {
          code: "secure_transport_required",
          message: "Password login requires HTTPS"
        }
      });
    }

    const throttleKey = loginThrottleKey(request);
    const retryAfterSeconds = loginThrottle.beginAttempt(throttleKey);

    if (retryAfterSeconds !== null) {
      reply.header("retry-after", String(retryAfterSeconds));
      return reply.status(429).send({
        error: {
          code: "too_many_login_attempts",
          message: "Too many login attempts. Try again shortly."
        }
      });
    }

    const session = await passwordAuth!.login(request.body.username, request.body.password);

    if (!session) {
      return reply.status(401).send({
        error: {
          code: "invalid_credentials",
          message: "Invalid username or password"
        }
      });
    }

    loginThrottle.recordSuccess(throttleKey);
    reply.header(
      "set-cookie",
      serializeSessionCookie(session.token, {
        maxAgeSeconds: Math.max(1, Math.floor(passwordAuth!.sessionTtlMs / 1_000)),
        secure: authOptions.secureCookies ?? isSecureRequest(request)
      })
    );

    const result: AuthSessionResult = {
      mode: "password",
      authenticated: true,
      user: { username: session.username }
    };
    return result;
  });

  server.post("/api/auth/logout", async (request, reply): Promise<AuthSessionResult> => {
    reply.header("cache-control", "no-store");

    if (passwordAuth) {
      await passwordAuth.logout(readSessionCookie(request));
    }

    reply.header(
      "set-cookie",
      clearSessionCookie(authOptions.mode === "password" && (authOptions.secureCookies ?? isSecureRequest(request)))
    );

    return {
      mode: authOptions.mode,
      authenticated: authOptions.mode === "none"
    };
  });

  server.get("/api/workspace", async (request) => {
    request.log.info({ workspace: runtime.rootPath }, "workspace.info");
    return runtime.info();
  });

  server.get("/api/tree", async (request) => {
    request.log.info({ workspace: runtime.rootPath }, "tree.read");
    return runtime.getTree();
  });

  server.get<{ Querystring: { path?: string } }>("/api/asset", async (request, reply) => {
    if (!request.query.path) {
      return reply.status(400).send({
        error: { code: "missing_path", message: "Missing asset path" }
      });
    }

    try {
      const asset = await runtime.readAsset(request.query.path);
      reply.header("content-type", asset.contentType);
      reply.header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`);
      return reply.send(asset.data);
    } catch {
      return reply.status(400).send({
        error: { code: "invalid_asset_path", message: "Asset path is not readable" }
      });
    }
  });

  server.post<{
    Querystring: { fileName?: string };
    Body: Buffer;
  }>("/api/assets", async (request, reply): Promise<SaveAssetResult | unknown> => {
    if (!request.query.fileName || !Buffer.isBuffer(request.body) || request.body.length === 0) {
      return reply.status(400).send({
        error: { code: "invalid_asset_upload", message: "Asset name and content are required" }
      });
    }

    try {
      return await runtime.saveAsset(request.query.fileName, request.body);
    } catch (error) {
      return reply.status(400).send({
        error: {
          code: "invalid_asset_upload",
          message: error instanceof Error ? error.message : "Asset could not be saved"
        }
      });
    }
  });

  server.get("/api/events", async (request, reply) => {
    request.log.info({ workspace: runtime.rootPath }, "events.subscribe");
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    reply.raw.write(": connected\n\n");

    const unsubscribe = runtime.events.subscribe((envelope) => {
      reply.raw.write(formatSseEvent(envelope));
    });
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 30_000);
    let closed = false;
    const closeStream = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      closeEventStreams.delete(closeStream);
      if (!reply.raw.writableEnded) reply.raw.end();
      request.log.info({ workspace: runtime.rootPath }, "events.unsubscribe");
    };

    closeEventStreams.add(closeStream);
    request.raw.once("close", closeStream);
  });

  server.get<{ Querystring: { path?: string } }>("/api/page", async (request, reply) => {
    if (!request.query.path) {
      request.log.warn("page.open.missing_path");
      return reply.status(400).send({
        error: {
          code: "missing_path",
          message: "Missing page path"
        }
      });
    }

    request.log.info({ path: request.query.path }, "page.open");
    return runtime.openPage(request.query.path);
  });

  server.post<{ Body: SavePageRequest }>("/api/page/save", async (request, reply) => {
    request.log.info({ path: request.body.path, reason: request.body.reason }, "page.save");
    const result = await runtime.savePage(request.body);

    if (result.status === "conflict") {
      request.log.warn(
        {
          path: result.path,
          currentVersion: result.currentVersion,
          attemptedBaseVersion: result.attemptedBaseVersion
        },
        "page.save.conflict"
      );
      return reply.status(409).send(result);
    }

    request.log.info({ path: result.path, version: result.version }, "page.save.ok");
    return result;
  });

  server.get<{ Querystring: { path?: string } }>("/api/revisions", async (request, reply) => {
    if (!request.query.path) {
      return reply.status(400).send({
        error: { code: "missing_path", message: "Missing page path" }
      });
    }

    return runtime.listRevisions(request.query.path);
  });

  server.get<{ Params: { revisionId: string } }>(
    "/api/revisions/:revisionId",
    async (request) => runtime.getRevision(request.params.revisionId)
  );

  server.post<{ Body: CheckpointRequest }>("/api/revisions/checkpoint", async (request) =>
    runtime.checkpointNow(request.body)
  );

  server.post<{ Body: RestoreRevisionRequest }>("/api/revisions/restore", async (request) =>
    runtime.restoreRevision(request.body)
  );

  server.post<{ Body: SearchWorkspaceRequest }>("/api/search", async (request) =>
    runtime.searchWorkspace(request.body)
  );

  server.post<{ Body: CreatePageRequest }>("/api/pages", async (request) => {
    request.log.info({ parentPath: request.body.parentPath, name: request.body.name }, "page.create");
    const result = await runtime.createPage(request.body);
    request.log.info({ path: result.path }, "page.create.ok");
    return result;
  });

  server.post<{ Body: CreateFolderRequest }>("/api/folders", async (request) => {
    request.log.info({ parentPath: request.body.parentPath, name: request.body.name }, "folder.create");
    const result = await runtime.createFolder(request.body);
    request.log.info({ path: result.path }, "folder.create.ok");
    return result;
  });

  server.post<{ Body: CreateDatabaseRequest }>("/api/databases", async (request) => {
    request.log.info(
      { parentPath: request.body.parentPath, name: request.body.name },
      "database.create"
    );
    const result = await runtime.createDatabase(request.body);
    request.log.info({ path: result.path }, "database.create.ok");
    return result;
  });

  server.post<{ Body: QueryDatabaseRequest }>("/api/database/query", async (request) => {
    request.log.info({ databasePath: request.body.databasePath }, "database.query");
    return runtime.queryDatabase(request.body);
  });

  server.post<{ Body: CreateDatabaseRecordRequest }>("/api/database/records", async (request) => {
    request.log.info(
      { databasePath: request.body.databasePath, name: request.body.name },
      "database.record.create"
    );
    return runtime.createDatabaseRecord(request.body);
  });

  server.post<{ Body: UpdateDatabaseRecordPropertyRequest }>(
    "/api/database/records/property",
    async (request, reply) => {
      const result = await runtime.updateDatabaseRecordProperty(request.body);

      if (result.status === "conflict") {
        return reply.status(409).send(result);
      }

      return result;
    }
  );

  server.post<{ Body: UpdateDatabaseSchemaRequest }>(
    "/api/database/schema",
    async (request, reply) => {
      const result = await runtime.updateDatabaseSchema(request.body);

      if (result.status === "conflict") {
        return reply.status(409).send(result);
      }

      return result;
    }
  );

  server.post<{ Body: CreateDatabasePropertyOptionRequest }>(
    "/api/database/schema/property/options",
    async (request, reply) => {
      const result = await runtime.createDatabasePropertyOption(request.body);

      if (result.status === "conflict") {
        return reply.status(409).send(result);
      }

      return result;
    }
  );

  server.post<{ Body: UpdateDatabasePropertyOptionRequest }>(
    "/api/database/schema/property/options/update",
    async (request, reply) => {
      const result = await runtime.updateDatabasePropertyOption(request.body);

      if (result.status === "conflict") {
        return reply.status(409).send(result);
      }

      return result;
    }
  );

  server.post<{ Body: RenameDatabasePropertyRequest }>(
    "/api/database/schema/property/rename",
    async (request, reply) => {
      const result = await runtime.renameDatabaseProperty(request.body);

      if (result.status === "conflict") {
        return reply.status(409).send(result);
      }

      return result;
    }
  );

  server.post<{ Body: ChangeDatabasePropertyTypeRequest }>(
    "/api/database/schema/property/type",
    async (request, reply) => {
      const result = await runtime.changeDatabasePropertyType(request.body);

      if (result.status === "conflict") {
        return reply.status(409).send(result);
      }

      return result;
    }
  );

  server.post<{ Body: DeleteDatabasePropertyRequest }>(
    "/api/database/schema/property/delete",
    async (request, reply) => {
      const result = await runtime.deleteDatabaseProperty(request.body);

      if (result.status === "conflict") {
        return reply.status(409).send(result);
      }

      return result;
    }
  );

  server.post<{ Body: RenameNodeRequest }>("/api/nodes/rename", async (request) => {
    request.log.info({ path: request.body.path, newName: request.body.newName }, "node.rename");
    const result = await runtime.renameNode(request.body);
    request.log.info({ previousPath: result.previousPath, path: result.path }, "node.rename.ok");
    return result;
  });

  server.post<{ Body: MoveNodeRequest }>("/api/nodes/move", async (request) => {
    request.log.info({ path: request.body.path, newParentPath: request.body.newParentPath }, "node.move");
    const result = await runtime.moveNode(request.body);
    request.log.info({ previousPath: result.previousPath, path: result.path }, "node.move.ok");
    return result;
  });

  server.post<{ Body: DeleteNodeRequest }>("/api/nodes/delete", async (request) => {
    request.log.info({ path: request.body.path, recursive: request.body.recursive ?? false }, "node.delete");
    const result = await runtime.deleteNode(request.body);
    request.log.info({ path: result.path }, "node.delete.ok");
    return result;
  });

  server.get("/api/trash", async () => runtime.listTrash());

  server.post<{ Body: RestoreTrashItemRequest }>("/api/trash/restore", async (request) => {
    request.log.info({ trashItemId: request.body.id }, "trash.restore");
    const result = await runtime.restoreTrashItem(request.body);
    request.log.info(
      { trashItemId: request.body.id, originalPath: result.originalPath, path: result.path },
      "trash.restore.ok"
    );
    return result;
  });

  return {
    server,
    runtime,
    url: ""
  };
}

async function resolveWebRoot(configuredRoot: string | false | undefined): Promise<string | null> {
  if (configuredRoot === false) {
    return null;
  }

  const candidates = [
    ...(configuredRoot ? [configuredRoot] : []),
    ...(process.env.RUMI_WEB_ROOT ? [process.env.RUMI_WEB_ROOT] : []),
    path.resolve(process.cwd(), "apps/web/dist")
  ];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    const indexStat = await fs.stat(path.join(resolved, "index.html")).catch(() => null);

    if (indexStat?.isFile()) {
      return resolved;
    }
  }

  if (configuredRoot) {
    throw new Error(`Web client build not found at ${path.resolve(configuredRoot)}`);
  }

  return null;
}

function formatSseEvent(envelope: RumiEventEnvelope): string {
  return [
    `id: ${envelope.id}`,
    `event: ${envelope.event.name}`,
    `data: ${JSON.stringify(envelope.event)}`,
    ""
  ].join("\n") + "\n";
}

export async function startRumiServer(options: StartRumiServerOptions): Promise<StartedRumiServer> {
  const started = await createRumiServer(options);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  const url = await started.server.listen({ host, port });

  return {
    ...started,
    url
  };
}

class LoginThrottle {
  private readonly attempts = new Map<string, { failures: number; blockedUntil: number }>();

  beginAttempt(key: string): number | null {
    const attempt = this.attempts.get(key);

    if (attempt && attempt.blockedUntil > Date.now()) {
      return Math.max(1, Math.ceil((attempt.blockedUntil - Date.now()) / 1_000));
    }

    const failures = (attempt?.failures ?? 0) + 1;
    this.attempts.set(key, {
      failures,
      blockedUntil: failures >= 5 ? Date.now() + 60_000 : 0
    });
    return null;
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }
}

function readSessionCookie(request: FastifyRequest): string | undefined {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = part.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function serializeSessionCookie(
  token: string,
  options: { maxAgeSeconds: number; secure: boolean }
): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`,
    ...(options.secure ? ["Secure"] : [])
  ].join("; ");
}

function clearSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function isSameOriginRequest(request: FastifyRequest): boolean {
  if (firstHeaderValue(request.headers["sec-fetch-site"]) === "cross-site") {
    return false;
  }

  const originHeader = firstHeaderValue(request.headers.origin);

  if (!originHeader) {
    return true;
  }

  const host = firstHeaderValue(request.headers["x-forwarded-host"]) ?? request.headers.host;
  const protocol = firstHeaderValue(request.headers["x-forwarded-proto"]) ?? request.protocol;

  if (!host || !protocol) {
    return false;
  }

  try {
    return new URL(originHeader).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

function isSecureRequest(request: FastifyRequest): boolean {
  return (firstHeaderValue(request.headers["x-forwarded-proto"]) ?? request.protocol) === "https";
}

function isLoopbackProxyRequest(request: FastifyRequest): boolean {
  return isLoopbackAddress(
    firstHeaderValue(request.headers["x-rumi-client-address"]) ?? request.ip
  );
}

function loginThrottleKey(request: FastifyRequest): string {
  const proxyAddress = firstHeaderValue(request.headers["x-rumi-client-address"]);
  const trustedProxyAddress = proxyAddress ?? request.ip;
  const cloudflareAddress = firstHeaderValue(request.headers["cf-connecting-ip"]);

  if (
    isSecureRequest(request) &&
    isLoopbackAddress(trustedProxyAddress) &&
    cloudflareAddress &&
    isIP(normalizeAddress(cloudflareAddress)) !== 0
  ) {
    return `cloudflare:${normalizeAddress(cloudflareAddress)}`;
  }

  return `client:${normalizeAddress(trustedProxyAddress)}`;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value?.split(",", 1)[0];
  return first?.trim().toLowerCase();
}

function normalizeAddress(address: string): string {
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }

  const normalized = normalizeAddress(address);
  return isIP(normalized) !== 0 && (normalized === "::1" || normalized.startsWith("127."));
}

function isLoginRequest(value: unknown): value is AuthLoginRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "username" in value &&
    "password" in value &&
    typeof value.username === "string" &&
    typeof value.password === "string" &&
    value.username.length <= 64 &&
    value.password.length <= 1_024
  );
}

function errorStatusCode(error: Error): number {
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
  }

  if ("code" in error && (error.code === "EEXIST" || error.code === "ENOTEMPTY")) {
    return 409;
  }

  return 500;
}

export { resolveAuthStatePath, setLocalPassword } from "./auth";
export type { RumiAuthOptions, SetLocalPasswordOptions } from "./auth";

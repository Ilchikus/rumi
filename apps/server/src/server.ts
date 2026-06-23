import Fastify, { type FastifyInstance } from "fastify";
import type {
  CreateFolderRequest,
  CreatePageRequest,
  DeleteNodeRequest,
  MoveNodeRequest,
  RenameNodeRequest,
  RumiEventEnvelope,
  SavePageRequest
} from "@rumi/contracts";
import { WorkspaceRuntime } from "@rumi/runtime";

export interface CreateRumiServerOptions {
  workspacePath: string;
  logLevel?: RumiLogLevel;
  prettyLogs?: boolean;
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
  const runtime = await WorkspaceRuntime.open({ rootPath: options.workspacePath });
  await runtime.startWatchingWorkspace();
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

  server.setErrorHandler((error: Error, _request, reply) => {
    _request.log.error({ err: error }, "request.error");
    reply.status(500).send({
      error: {
        code: "internal_error",
        message: error.message
      }
    });
  });

  server.addHook("onClose", async () => {
    await runtime.stopWatchingWorkspace();
  });

  server.get("/api/workspace", async (request) => {
    request.log.info({ workspace: runtime.rootPath }, "workspace.info");
    return runtime.info();
  });

  server.get("/api/tree", async (request) => {
    request.log.info({ workspace: runtime.rootPath }, "tree.read");
    return runtime.getTree();
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

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      request.log.info({ workspace: runtime.rootPath }, "events.unsubscribe");
    });
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

  return {
    server,
    runtime,
    url: ""
  };
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

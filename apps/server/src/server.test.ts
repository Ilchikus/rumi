import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempWorkspace } from "@rumi/runtime";
import { createRumiServer } from "./server";

const cleanupPaths: string[] = [];

afterEach(async () => {
  for (const cleanupPath of cleanupPaths.splice(0)) {
    await fs.rm(cleanupPath, { recursive: true, force: true });
  }
});

describe("Rumi server API", () => {
  it("serves the official web build with SPA fallback while keeping API errors structured", async () => {
    const root = await tempWorkspace();
    const webRoot = await createTempWorkspace("rumi-web-build-");
    cleanupPaths.push(webRoot);
    await fs.mkdir(path.join(webRoot, "assets"), { recursive: true });
    await fs.writeFile(path.join(webRoot, "index.html"), "<!doctype html><main>Rumi client</main>", "utf8");
    await fs.writeFile(path.join(webRoot, "assets", "app.js"), "globalThis.rumi = true;", "utf8");
    const { server } = await createRumiServer({ workspacePath: root, webRoot });

    const rootResponse = await server.inject({ method: "GET", url: "/" });
    expect(rootResponse.statusCode).toBe(200);
    expect(rootResponse.body).toContain("Rumi client");
    expect(rootResponse.headers["cache-control"]).toContain("no-cache");
    expect(rootResponse.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(rootResponse.headers["x-frame-options"]).toBe("DENY");

    const routeResponse = await server.inject({ method: "GET", url: "/workspace/page" });
    expect(routeResponse.statusCode).toBe(200);
    expect(routeResponse.body).toContain("Rumi client");

    const assetResponse = await server.inject({ method: "GET", url: "/assets/app.js" });
    expect(assetResponse.statusCode).toBe(200);
    expect(assetResponse.body).toContain("globalThis.rumi");

    const apiResponse = await server.inject({ method: "GET", url: "/api/missing" });
    expect(apiResponse.statusCode).toBe(404);
    expect(apiResponse.json()).toEqual({
      error: { code: "not_found", message: "Route not found" }
    });

    await server.close();
  });

  it("opens tree and page through HTTP routes", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Idea.md"), "# Idea", "utf8");
    const { server } = await createRumiServer({ workspacePath: root });

    const treeResponse = await server.inject({ method: "GET", url: "/api/tree" });
    expect(treeResponse.statusCode).toBe(200);
    expect(treeResponse.json()).toMatchObject({
      kind: "workspace",
      children: [{ name: "Idea.md", kind: "page" }]
    });

    const pageResponse = await server.inject({ method: "GET", url: "/api/page?path=Idea.md" });
    expect(pageResponse.statusCode).toBe(200);
    expect(pageResponse.json()).toMatchObject({
      path: "Idea.md",
      markdownBody: "# Idea"
    });

    await server.close();
  });

  it("serves safe workspace assets without exposing Markdown or hidden state", async () => {
    const root = await tempWorkspace();
    await fs.mkdir(path.join(root, ".assets"), { recursive: true });
    await fs.writeFile(path.join(root, ".assets", "pixel.png"), Buffer.from([137, 80, 78, 71]));
    await fs.writeFile(path.join(root, "Secret.md"), "private", "utf8");
    const { server } = await createRumiServer({ workspacePath: root });

    const image = await server.inject({ method: "GET", url: "/api/asset?path=.assets%2Fpixel.png" });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.rawPayload).toEqual(Buffer.from([137, 80, 78, 71]));

    const markdown = await server.inject({ method: "GET", url: "/api/asset?path=Secret.md" });
    expect(markdown.statusCode).toBe(400);

    const traversal = await server.inject({ method: "GET", url: "/api/asset?path=..%2Foutside.png" });
    expect(traversal.statusCode).toBe(400);

    await server.close();
  });

  it("stores uploaded editor assets in the workspace with collision-safe names", async () => {
    const root = await tempWorkspace();
    const { server } = await createRumiServer({ workspacePath: root });
    const payload = Buffer.from([137, 80, 78, 71]);

    const first = await server.inject({
      method: "POST",
      url: "/api/assets?fileName=diagram.png",
      headers: { "content-type": "application/octet-stream" },
      payload
    });
    const second = await server.inject({
      method: "POST",
      url: "/api/assets?fileName=diagram.png",
      headers: { "content-type": "application/octet-stream" },
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: "saved", path: ".assets/diagram.png" });
    expect(second.json()).toMatchObject({ status: "saved", path: ".assets/diagram-2.png" });
    expect(await fs.readFile(path.join(root, ".assets", "diagram.png"))).toEqual(payload);

    const unsafe = await server.inject({
      method: "POST",
      url: "/api/assets?fileName=script.svg",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("<svg/>")
    });
    expect(unsafe.statusCode).toBe(400);

    await server.close();
  });

  it("returns 409 for stale save conflicts", async () => {
    const root = await tempWorkspace();
    const filePath = path.join(root, "Idea.md");
    await fs.writeFile(filePath, "# One", "utf8");
    const { server, runtime } = await createRumiServer({ workspacePath: root });
    const page = await runtime.openPage("Idea.md");
    await fs.writeFile(filePath, "# Two", "utf8");

    const response = await server.inject({
      method: "POST",
      url: "/api/page/save",
      payload: {
        path: "Idea.md",
        baseVersion: page.version,
        frontmatter: {},
        markdownBody: "# Stale",
        reason: "api"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      status: "conflict",
      path: "Idea.md"
    });

    await server.close();
  });

  it("streams page.changed events after API saves", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Idea.md"), "# Idea", "utf8");
    const { server, runtime } = await createRumiServer({ workspacePath: root });
    const url = await server.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();

    try {
      const eventsResponse = await fetch(`${url}/api/events`, { signal: controller.signal });
      expect(eventsResponse.status).toBe(200);
      expect(eventsResponse.headers.get("content-type")).toContain("text/event-stream");
      expect(eventsResponse.body).not.toBeNull();

      const reader = eventsResponse.body!.getReader();
      await readUntil(reader, ": connected");

      const page = await runtime.openPage("Idea.md");
      const saveResponse = await fetch(`${url}/api/page/save`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          path: page.path,
          baseVersion: page.version,
          frontmatter: page.frontmatter,
          markdownBody: "# Updated",
          reason: "api"
        })
      });
      expect(saveResponse.status).toBe(200);

      const eventText = await readUntil(reader, "event: page.changed");
      expect(eventText).toContain('"name":"page.changed"');
      expect(eventText).toContain('"path":"Idea.md"');
      expect(eventText).toContain('"changedBy":"api"');
    } finally {
      controller.abort();
      await server.close();
    }
  });

  it("runs sidebar CRUD operations through API routes", async () => {
    const root = await tempWorkspace();
    const { server } = await createRumiServer({ workspacePath: root });

    const createPage = await server.inject({
      method: "POST",
      url: "/api/pages",
      payload: {
        parentPath: "",
        name: "Idea",
        markdownBody: "# Idea"
      }
    });
    expect(createPage.statusCode).toBe(200);

    const createFolder = await server.inject({
      method: "POST",
      url: "/api/folders",
      payload: {
        parentPath: "",
        name: "Archive"
      }
    });
    expect(createFolder.statusCode).toBe(200);

    const move = await server.inject({
      method: "POST",
      url: "/api/nodes/move",
      payload: {
        path: "Idea.md",
        newParentPath: "Archive"
      }
    });
    expect(move.statusCode).toBe(200);

    const rename = await server.inject({
      method: "POST",
      url: "/api/nodes/rename",
      payload: {
        path: "Archive/Idea.md",
        newName: "Moved idea"
      }
    });
    expect(rename.statusCode).toBe(200);

    const deleteNode = await server.inject({
      method: "POST",
      url: "/api/nodes/delete",
      payload: {
        path: "Archive/Moved idea.md"
      }
    });
    expect(deleteNode.statusCode).toBe(200);

    await expect(fs.stat(path.join(root, "Archive", "Moved idea.md"))).rejects.toThrow();
    await server.close();
  });

  it("runs database commands through domain API routes", async () => {
    const root = await tempWorkspace();
    const { server } = await createRumiServer({ workspacePath: root });

    const createDatabase = await server.inject({
      method: "POST",
      url: "/api/databases",
      payload: { parentPath: "", name: "Tasks" }
    });
    expect(createDatabase.statusCode).toBe(200);

    const createRecord = await server.inject({
      method: "POST",
      url: "/api/database/records",
      payload: {
        databasePath: "Tasks",
        name: "API record",
        frontmatter: { status: "ready" }
      }
    });
    expect(createRecord.statusCode).toBe(200);

    const query = await server.inject({
      method: "POST",
      url: "/api/database/query",
      payload: { databasePath: "Tasks" }
    });
    expect(query.statusCode).toBe(200);
    expect(query.json()).toMatchObject({
      databasePath: "Tasks",
      records: [
        {
          path: "Tasks/API record.md",
          frontmatter: { status: "ready" }
        }
      ]
    });

    const record = query.json().records[0] as { path: string; version: string };
    const update = await server.inject({
      method: "POST",
      url: "/api/database/records/property",
      payload: {
        databasePath: "Tasks",
        recordPath: record.path,
        baseVersion: record.version,
        property: "status",
        value: "done"
      }
    });
    expect(update.statusCode).toBe(200);

    const updatedQuery = await server.inject({
      method: "POST",
      url: "/api/database/query",
      payload: { databasePath: "Tasks" }
    });
    expect(updatedQuery.json().records[0].frontmatter.status).toBe("done");

    const schemaUpdate = await server.inject({
      method: "POST",
      url: "/api/database/schema",
      payload: {
        databasePath: "Tasks",
        baseVersion: updatedQuery.json().schemaVersion,
        properties: {
          status: { type: "text" },
          priority: { type: "select", options: [{ name: "normal" }] }
        },
        views: [{ name: "All", type: "table", columns: ["status", "priority"] }]
      }
    });
    expect(schemaUpdate.statusCode).toBe(200);

    const schemaQuery = await server.inject({
      method: "POST",
      url: "/api/database/query",
      payload: { databasePath: "Tasks" }
    });
    const createOption = await server.inject({
      method: "POST",
      url: "/api/database/schema/property/options",
      payload: {
        databasePath: "Tasks",
        baseVersion: schemaQuery.json().schemaVersion,
        property: "priority",
        option: "urgent",
        color: "teal"
      }
    });
    expect(createOption.statusCode).toBe(200);

    const optionQuery = await server.inject({
      method: "POST",
      url: "/api/database/query",
      payload: { databasePath: "Tasks" }
    });
    expect(optionQuery.json().schema.properties.priority.options).toEqual([
      { name: "normal" },
      { name: "urgent", color: "teal" }
    ]);

    const openRecord = await server.inject({
      method: "GET",
      url: "/api/page?path=Tasks%2FAPI%20record.md"
    });
    expect(openRecord.statusCode).toBe(200);
    expect(openRecord.json()).toMatchObject({
      path: "Tasks/API record.md",
      database: {
        databasePath: "Tasks",
        schemaVersion: optionQuery.json().schemaVersion,
        schema: {
          properties: {
            priority: {
              type: "select",
              options: [{ name: "normal" }, { name: "urgent" }]
            }
          }
        }
      }
    });

    const renameOption = await server.inject({
      method: "POST",
      url: "/api/database/schema/property/options/update",
      payload: {
        databasePath: "Tasks",
        baseVersion: optionQuery.json().schemaVersion,
        property: "priority",
        option: "urgent",
        action: "rename",
        newName: "critical"
      }
    });
    expect(renameOption.statusCode).toBe(200);
    const renamedOptionQuery = await server.inject({
      method: "POST",
      url: "/api/database/query",
      payload: { databasePath: "Tasks" }
    });
    expect(renamedOptionQuery.json().schema.properties.priority.options).toContainEqual({
      name: "critical",
      color: "teal"
    });

    const changeType = await server.inject({
      method: "POST",
      url: "/api/database/schema/property/type",
      payload: {
        databasePath: "Tasks",
        baseVersion: renamedOptionQuery.json().schemaVersion,
        property: "priority",
        type: "multi-select"
      }
    });
    expect(changeType.statusCode).toBe(200);
    const changedTypeQuery = await server.inject({
      method: "POST",
      url: "/api/database/query",
      payload: { databasePath: "Tasks" }
    });
    expect(changedTypeQuery.json().schema.properties.priority.type).toBe("multi-select");

    const deleteProperty = await server.inject({
      method: "POST",
      url: "/api/database/schema/property/delete",
      payload: {
        databasePath: "Tasks",
        baseVersion: changedTypeQuery.json().schemaVersion,
        property: "priority"
      }
    });
    expect(deleteProperty.statusCode).toBe(200);
    const deletedPropertyQuery = await server.inject({
      method: "POST",
      url: "/api/database/query",
      payload: { databasePath: "Tasks" }
    });
    expect(deletedPropertyQuery.json().schema.properties.priority).toBeUndefined();

    const renameProperty = await server.inject({
      method: "POST",
      url: "/api/database/schema/property/rename",
      payload: {
        databasePath: "Tasks",
        baseVersion: deletedPropertyQuery.json().schemaVersion,
        property: "status",
        newName: "state"
      }
    });
    expect(renameProperty.statusCode).toBe(200);

    const renamedQuery = await server.inject({
      method: "POST",
      url: "/api/database/query",
      payload: { databasePath: "Tasks" }
    });
    expect(renamedQuery.json()).toMatchObject({
      schema: { properties: { state: { type: "text" } } },
      records: [{ frontmatter: { state: "done" } }]
    });

    await server.close();
  });

  it("creates, reads, and restores Rumi-owned revisions through HTTP", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "History.md"), "# Original", "utf8");
    const { server, runtime } = await createRumiServer({ workspacePath: root });
    const original = await runtime.openPage("History.md");
    await runtime.savePage({
      path: original.path,
      baseVersion: original.version,
      frontmatter: {},
      markdownBody: "# Updated",
      reason: "manual-save"
    });

    const list = await server.inject({
      method: "GET",
      url: "/api/revisions?path=History.md"
    });
    expect(list.statusCode).toBe(200);
    const revisions = list.json() as Array<{ revisionId: string; reason: string }>;
    expect(revisions.map((revision) => revision.reason)).toEqual([
      "manual-checkpoint",
      "baseline"
    ]);

    const content = await server.inject({
      method: "GET",
      url: `/api/revisions/${encodeURIComponent(revisions[1]!.revisionId)}`
    });
    expect(content.json().markdown).toBe("# Original");

    const restore = await server.inject({
      method: "POST",
      url: "/api/revisions/restore",
      payload: { revisionId: revisions[1]!.revisionId }
    });
    expect(restore.statusCode).toBe(200);
    await expect(fs.readFile(path.join(root, "History.md"), "utf8")).resolves.toBe("# Original");

    await server.close();
  });

  it("searches the server-owned content index through HTTP", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Roadmap.md"), "Editor performance backlog", "utf8");
    const { server } = await createRumiServer({ workspacePath: root });

    const response = await server.inject({
      method: "POST",
      url: "/api/search",
      payload: { query: "performance" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      query: "performance",
      items: [{ path: "Roadmap.md", title: "Roadmap", kind: "page" }]
    });
    await server.close();
  });

  it("keeps default logger quiet for normal info events", async () => {
    const root = await tempWorkspace();
    await fs.writeFile(path.join(root, "Idea.md"), "# Idea", "utf8");
    const { server } = await createRumiServer({ workspacePath: root });

    const response = await server.inject({ method: "GET", url: "/api/page?path=Idea.md" });

    expect(response.statusCode).toBe(200);
    await server.close();
  });
});

async function tempWorkspace(): Promise<string> {
  const root = await createTempWorkspace("rumi-server-");
  cleanupPaths.push(root);
  return root;
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pattern: string
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";

  while (!text.includes(pattern)) {
    const result = await readWithTimeout(reader, 2_000);

    if (result.done) {
      throw new Error(`SSE stream closed before ${pattern}`);
    }

    text += decoder.decode(result.value, { stream: true });
  }

  return text;
}

function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for SSE event")), timeoutMs);
    })
  ]);
}

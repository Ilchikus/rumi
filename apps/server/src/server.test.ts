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

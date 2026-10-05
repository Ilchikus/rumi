import { describe, expect, it, vi } from "vitest";
import { isAuthenticationRequiredError, RumiApiClient, RumiApiError } from "./index";

describe("RumiApiClient image presentation", () => {
  it("sends one typed image-presentation update with the client identity", async () => {
    let requestedUrl: Parameters<typeof fetch>[0] | undefined;
    let requestedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return new Response(JSON.stringify({
        status: "saved",
        path: "Idea.md",
        presentation: {
          images: { ".assets/diagram.png": { widthPx: 480, alignment: "left" } }
        },
        presentationVersion: "next",
        events: []
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
    const client = new RumiApiClient({ fetchImpl, clientId: "client-1" });

    await expect(client.updateImagePresentation({
      path: "Idea.md",
      imageSrc: ".assets/diagram.png",
      widthPx: 480,
      alignment: "left",
      basePresentationVersion: "base"
    })).resolves.toMatchObject({ status: "saved", presentationVersion: "next" });

    expect(requestedUrl).toBe("/api/page/image-presentation");
    expect(requestedInit?.method).toBe("PUT");
    expect(new Headers(requestedInit?.headers).get("x-rumi-client-id")).toBe("client-1");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      path: "Idea.md",
      imageSrc: ".assets/diagram.png",
      widthPx: 480,
      alignment: "left",
      basePresentationVersion: "base"
    });
  });
});

describe("RumiApiClient media inventory", () => {
  it("gets the typed asset list from the upload resource with the client identity", async () => {
    let requestedUrl: Parameters<typeof fetch>[0] | undefined;
    let requestedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return new Response(JSON.stringify({
        items: [{
          path: ".assets/photo.png",
          fileName: "photo.png",
          contentType: "image/png",
          size: 12,
          modifiedAt: "2026-08-22T10:00:00.000Z"
        }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };
    const client = new RumiApiClient({ fetchImpl, clientId: "media-client" });

    await expect(client.listAssets()).resolves.toMatchObject({
      items: [{ path: ".assets/photo.png", size: 12 }]
    });
    expect(requestedUrl).toBe("/api/assets");
    expect(requestedInit?.method).toBeUndefined();
    expect(new Headers(requestedInit?.headers).get("x-rumi-client-id")).toBe("media-client");
  });
});

describe("RumiApiClient authentication errors", () => {
  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    });
  }

  it("reports an expired session before rejecting with a typed error", async () => {
    const onAuthenticationRequired = vi.fn();
    const client = new RumiApiClient({
      fetchImpl: vi.fn(async () => jsonResponse(401, {
        error: { code: "authentication_required", message: "Authentication required" }
      })),
      onAuthenticationRequired
    });

    const error = await client.getTree().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(RumiApiError);
    expect(error).toMatchObject({ status: 401, code: "authentication_required" });
    expect(isAuthenticationRequiredError(error)).toBe(true);
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
  });

  it("does not treat rejected credentials or other failures as an expired session", async () => {
    const onAuthenticationRequired = vi.fn();
    const responses = [
      jsonResponse(401, { error: { code: "invalid_credentials", message: "Invalid username or password" } }),
      jsonResponse(500, { error: { code: "internal", message: "Boom" } })
    ];
    const client = new RumiApiClient({
      fetchImpl: vi.fn(async () => responses.shift()!),
      onAuthenticationRequired
    });

    await expect(client.login({ username: "owner", password: "wrong" }))
      .rejects.toMatchObject({ status: 401, code: "invalid_credentials", message: "Invalid username or password" });
    await expect(client.getTree()).rejects.toMatchObject({ status: 500, message: "Boom" });
    expect(onAuthenticationRequired).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { RumiApiClient } from "./index";

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

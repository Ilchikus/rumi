import { isIP } from "node:net";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

const apiTarget = process.env.RUMI_API_TARGET ?? "http://127.0.0.1:3000";
const allowedHosts = ["dev-docs.rumi.md"];
const webRoot = new URL(".", import.meta.url).pathname;
const developmentHeaders = {
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};
const previewHeaders = {
  ...developmentHeaders,
  "Content-Security-Policy": [
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
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Permitted-Cross-Domain-Policies": "none"
};

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts,
    headers: developmentHeaders,
    fs: {
      strict: true,
      allow: [
        webRoot,
        new URL("../../packages/api-client/src", import.meta.url).pathname,
        new URL("../../packages/contracts/src", import.meta.url).pathname,
        new URL("../../packages/workspace-format/src", import.meta.url).pathname,
        new URL("../../node_modules", import.meta.url).pathname
      ]
    },
    proxy: createApiProxy()
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts,
    headers: previewHeaders,
    proxy: createApiProxy()
  },
  resolve: {
    alias: {
      "@rumi/api-client": new URL("../../packages/api-client/src/index.ts", import.meta.url).pathname,
      "@rumi/contracts": new URL("../../packages/contracts/src/index.ts", import.meta.url).pathname,
      "@rumi/workspace-format": new URL("../../packages/workspace-format/src/index.ts", import.meta.url).pathname
    }
  }
});

function createApiProxy(): Record<string, ProxyOptions> {
  return {
    "/api": {
      target: apiTarget,
      changeOrigin: true,
      configure(proxy) {
        proxy.on("proxyReq", (proxyRequest, request) => {
          const clientAddress = normalizeAddress(request.socket.remoteAddress);

          if (request.headers.host) {
            proxyRequest.setHeader("x-forwarded-host", request.headers.host);
          }

          proxyRequest.setHeader("x-rumi-client-address", clientAddress ?? "unknown");
          const forwardedProtocol = isLoopbackAddress(clientAddress)
            ? firstHeaderValue(request.headers["x-forwarded-proto"])
            : undefined;
          proxyRequest.setHeader(
            "x-forwarded-proto",
            forwardedProtocol ?? "http"
          );

          if (!isLoopbackAddress(clientAddress)) {
            proxyRequest.removeHeader("cf-connecting-ip");
            proxyRequest.removeHeader("x-forwarded-for");
          }
        });
      }
    }
  };
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value?.split(",", 1)[0];
  return first?.trim().toLowerCase();
}

function normalizeAddress(address: string | undefined): string | undefined {
  return address?.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address || isIP(address) === 0) {
    return false;
  }

  return address === "::1" || address.startsWith("127.");
}

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.RUMI_API_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      "@rumi/api-client": new URL("../../packages/api-client/src/index.ts", import.meta.url).pathname,
      "@rumi/contracts": new URL("../../packages/contracts/src/index.ts", import.meta.url).pathname,
      "@rumi/workspace-format": new URL("../../packages/workspace-format/src/index.ts", import.meta.url).pathname
    }
  }
});

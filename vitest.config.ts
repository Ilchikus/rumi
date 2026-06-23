import { defineConfig } from "vitest/config";

export default defineConfig({
  css: {
    postcss: new URL("./apps/web/postcss.config.js", import.meta.url).pathname
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@rumi/contracts": new URL("./packages/contracts/src/index.ts", import.meta.url).pathname,
      "@rumi/api-client": new URL("./packages/api-client/src/index.ts", import.meta.url).pathname,
      "@rumi/markdown": new URL("./packages/markdown/src/index.ts", import.meta.url).pathname,
      "@rumi/runtime": new URL("./packages/runtime/src/index.ts", import.meta.url).pathname,
      "@rumi/workspace-format": new URL("./packages/workspace-format/src/index.ts", import.meta.url).pathname,
      "@rumi/server": new URL("./apps/server/src/server.ts", import.meta.url).pathname
    }
  }
});

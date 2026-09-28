import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

// Seeds run only on demand, never with the test suite.
export default defineConfig({
  resolve: { alias: { "@": resolve(rootDir, "src") } },
  test: { environment: "node", include: ["scripts/seed/**/*.run.ts"], root: rootDir, fileParallelism: false },
});

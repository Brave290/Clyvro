import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    // PGlite-backed integration suites spin up migrations and a real
    // (in-memory) Postgres per file; the per-test default of 5s was
    // timing out healthy tests in `shield.test.ts` and `flow-scan.test.ts`.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});

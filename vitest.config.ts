import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000, // seeding a remote database (e.g. Neon) takes longer than the default
  },
});

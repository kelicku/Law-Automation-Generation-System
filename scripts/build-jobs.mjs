// Bundles the background job function into a self-contained file for Netlify.
// "server-only" is aliased to an empty module: this code never runs in a browser.
import { build } from "esbuild";
import path from "node:path";

await build({
  entryPoints: ["jobs/ai-job-background.ts"],
  outfile: "netlify/functions/ai-job-background.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  tsconfig: "tsconfig.json",
  alias: { "server-only": path.resolve("tests/server-only-stub.ts") },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
console.log("built netlify/functions/ai-job-background.mjs");

// Runs a command with .env.netlify.local loaded (overriding .env.local). Usage: node scripts/dev/with-prod-env.mjs <cmd> [args...]
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.netlify.local", override: true, quiet: true });
const r = spawnSync(process.argv[2], process.argv.slice(3), { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);

// Writes .env.netlify.local (git-ignored) with production settings for Netlify + Neon. Prints only key names.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
if (existsSync(".env.netlify.local")) { console.log("exists — keeping current secrets"); process.exit(0); }
const owner = new URL(readFileSync(".env.neon.local", "utf8").match(/NEON_OWNER_URL=(.*)/)[1].trim());
owner.searchParams.delete("channel_binding");
const pw = () => `${randomBytes(18).toString("base64url")}Aa9!`;
const make = (user, pooled) => {
  const u = new URL(owner.toString());
  u.username = user; u.password = encodeURIComponent(pw());
  if (pooled) u.hostname = u.hostname.replace(/^([^.]+)/, "$1-pooler");
  return u.toString();
};
const local = readFileSync(".env", "utf8");
const anthropic = (local.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(\S+)/m) ?? [])[1] ?? "";
const app = make("aiip_app", true), worker = make("aiip_worker", true);
const vars = {
  DATABASE_OWNER_URL: owner.toString(),
  DATABASE_APP_URL: app,
  DATABASE_WORKER_URL: worker,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  DEMO_MODE: "true",
  DEMO_ACCESS_CODE: "aiip-0a7e73",
  ANTHROPIC_API_KEY: anthropic,
  AI_MODEL: "claude-opus-5-5",
  BACKUP_DIR: "/tmp/aiip-backups",
  NODE_VERSION: "22",
};
writeFileSync(".env.netlify.local", Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
console.log("wrote .env.netlify.local:", Object.keys(vars).join(", "), "| anthropic key present:", anthropic.length > 20);

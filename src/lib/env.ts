import "server-only";

/** Server-only configuration. Never import from client components. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get appDbUrl() { return required("DATABASE_APP_URL"); },
  get workerDbUrl() { return required("DATABASE_WORKER_URL"); },
  get sessionSecret() { return required("SESSION_SECRET"); },
  get demoMode() { return process.env.DEMO_MODE === "true"; },
  get demoAccessCode() { return process.env.DEMO_ACCESS_CODE || null; },
  /** AI_FORCE_SIMULATION=true keeps automated tests free and deterministic even when a key is configured. */
  get anthropicKeyConfigured() { return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_FORCE_SIMULATION !== "true"; },
  get aiModel() { return process.env.AI_MODEL || "claude-opus-5-5"; },
  get liveRss() { return process.env.COLLECTOR_LIVE_RSS === "true"; },
};

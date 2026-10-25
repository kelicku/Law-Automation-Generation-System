import { config } from "dotenv";
import postgres from "postgres";
import type { APIRequestContext, Page } from "@playwright/test";
import { seedDemo } from "../../src/lib/demo/seed";

config({ path: ".env.local", quiet: true });

/** access code configured for the E2E server (playwright.config.ts) */
export const DEMO_CODE = "e2e-code";

export async function resetDb() {
  const sql = postgres(process.env.DATABASE_WORKER_URL!, { max: 1, onnotice: () => {} });
  try {
    await seedDemo(sql);
  } finally {
    await sql.end();
  }
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const sql = postgres(process.env.DATABASE_OWNER_URL!, { max: 1, onnotice: () => {} });
  try {
    return (await sql.unsafe(text, params as never[])) as unknown as T[];
  } finally {
    await sql.end();
  }
}

export function origin(page: Page | APIRequestContext) {
  return { origin: `http://localhost:${process.env.E2E_PORT ?? 3200}`, ...(page ? {} : {}) };
}

export async function loginAs(page: Page, persona: "seiran-lawyer" | "seiran-editor" | "hiiragi-lawyer" | "operator") {
  const r = await page.request.post("/api/auth/demo", { data: { persona, code: DEMO_CODE }, headers: origin(page) });
  if (!r.ok()) throw new Error(`demo login failed: ${r.status()} ${await r.text()}`);
}

export async function articleId(slug: string): Promise<string> {
  const [r] = await query<{ id: string }>("select id from article_drafts where slug = $1", [slug]);
  return r.id;
}

/** Collects console errors / uncaught exceptions for a page. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // expected: failed resource responses the test provokes on purpose (403/404/409 etc.)
    if (/Failed to load resource: the server responded with a status of (4\d\d)/.test(t)) return;
    errors.push(t);
  });
  return errors;
}

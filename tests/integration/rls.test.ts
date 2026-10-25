/**
 * Database-level security tests. These run directly against PostgreSQL as the restricted roles,
 * proving isolation does not depend on application code.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemo, type SeedResult } from "@/lib/demo/seed";

config({ path: ".env.local", quiet: true });

const app = postgres(process.env.DATABASE_APP_URL!, { max: 2, onnotice: () => {} });
const worker = postgres(process.env.DATABASE_WORKER_URL!, { max: 2, onnotice: () => {} });
let seed: SeedResult;
let articleA: string;
let articleB: string;

async function as<T>(userKey: string, tenantSlug: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${seed.users[userKey]}, true), set_config('app.tenant_id', ${tenantSlug ? seed.tenants[tenantSlug] : ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  seed = await seedDemo(worker);
  [{ id: articleA }] = await worker`select id from article_drafts where slug = 'aoba-life-subscription'`;
  [{ id: articleB }] = await worker`select id from article_drafts where slug = 'minato-seiki-leak-guide'`;
});

afterAll(async () => {
  await app.end();
  await worker.end();
});

describe("row level security", () => {
  it("a firm sees only its own private articles", async () => {
    const rows = await as("hiiragi-lawyer", "hiiragi-law", (tx) => tx`select tenant_id from article_drafts`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === seed.tenants["hiiragi-law"])).toBe(true);
    const direct = await as("hiiragi-lawyer", "hiiragi-law", (tx) => tx`select id from article_drafts where id = ${articleA}`);
    expect(direct).toHaveLength(0);
  });

  it("spoofing another tenant id does not grant access", async () => {
    const rows = await as("hiiragi-lawyer", "seiran-law", (tx) => tx`select id from article_drafts`);
    expect(rows).toHaveLength(0);
  });

  it("cross-tenant updates affect zero rows", async () => {
    const r = await as("hiiragi-lawyer", "hiiragi-law", (tx) => tx`update article_drafts set status = 'archived' where id = ${articleA} returning id`);
    expect(r).toHaveLength(0);
  });

  it("editors cannot record approvals; lawyers cannot approve other firms' articles", async () => {
    const [{ id: v }] = await worker`select id from article_versions where article_id = ${articleA} limit 1`;
    await expect(as("seiran-editor", "seiran-law", (tx) => tx`insert into approvals (tenant_id, article_id, version_id, decision, approver_id) values (${seed.tenants["seiran-law"]}, ${articleA}, ${v}, 'approved', ${seed.users["seiran-editor"]})`)).rejects.toThrow(/row-level security/);
    await expect(as("hiiragi-lawyer", "hiiragi-law", (tx) => tx`insert into approvals (tenant_id, article_id, version_id, decision, approver_id) values (${seed.tenants["seiran-law"]}, ${articleA}, ${v}, 'approved', ${seed.users["hiiragi-lawyer"]})`)).rejects.toThrow(/row-level security/);
  });

  it("the database refuses a published page without a matching approved approval", async () => {
    const [{ id: v, tenant_id: t }] = await worker`select id, tenant_id from article_versions where article_id = ${articleB} limit 1`;
    const [{ id: rejected }] = await worker`insert into approvals (tenant_id, article_id, version_id, decision, approver_id) values (${t}, ${articleB}, ${v}, 'rejected', ${seed.users["hiiragi-lawyer"]}) returning id`;
    const [{ incident_id }] = await worker`select incident_id from article_drafts where id = ${articleB}`;
    await expect(worker`insert into published_pages (tenant_id, article_id, version_id, approval_id, slug, status, content, incident_id) values (${t}, ${articleB}, ${v}, ${rejected}, 'x-test', 'live', '{}'::jsonb, ${incident_id})`).rejects.toThrow(/approved approval/);
  });

  it("the app role cannot read sessions or password hashes, nor rewrite the audit log", async () => {
    await expect(as("seiran-lawyer", "seiran-law", (tx) => tx`select password_hash from users`)).rejects.toThrow(/permission denied/);
    expect(await as("seiran-lawyer", "seiran-law", (tx) => tx`select * from sessions`).catch((e) => String(e))).toMatch(/permission denied/);
    await expect(as("seiran-lawyer", "seiran-law", (tx) => tx`delete from audit_logs`)).rejects.toThrow(/permission denied/);
  });

  it("an unauthenticated app context sees no shared or private data", async () => {
    const rows = await app.begin(async (tx) => [await tx`select id from incidents`, await tx`select id from article_drafts`]);
    expect(rows[0]).toHaveLength(0);
    expect(rows[1]).toHaveLength(0);
  });
});

describe("public site role", () => {
  it("reads only live published pages and cannot read drafts", async () => {
    await worker`update published_pages set status = 'suspended' where slug = 'koyo-financial-phishing'`;
    const pages = await app.begin(async (tx) => {
      await tx`set local role aiip_public`;
      return tx`select slug, status from published_pages`;
    });
    expect(pages.every((p) => p.status === "live")).toBe(true);
    expect(pages.some((p) => p.slug === "koyo-financial-phishing")).toBe(false);
    await expect(app.begin(async (tx) => {
      await tx`set local role aiip_public`;
      return tx`select * from article_drafts`;
    })).rejects.toThrow(/permission denied/);
    await worker`update published_pages set status = 'live' where slug = 'koyo-financial-phishing'`;
  });
});

describe("tenant settings isolation", () => {
  it("a firm cannot read another firm's settings or contract", async () => {
    const s = await as("hiiragi-lawyer", "hiiragi-law", (tx) => tx`select tenant_id from tenant_settings`);
    expect(s.map((r) => r.tenant_id)).toEqual([seed.tenants["hiiragi-law"]]);
    const sub = await as("hiiragi-lawyer", "hiiragi-law", (tx) => tx`select tenant_id from subscriptions`);
    expect(sub.map((r) => r.tenant_id)).toEqual([seed.tenants["hiiragi-law"]]);
  });
});

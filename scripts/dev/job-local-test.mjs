// Invokes the bundled background function locally for an article job and a collect job.
import postgres from "postgres";
const fn = (await import("../../netlify/functions/ai-job-background.mjs")).default;
import { createHmac } from "node:crypto";
const sig = (id) => createHmac("sha256", process.env.SESSION_SECRET).update(`ai-job:${id}`).digest("hex");
const sql = postgres(process.env.DATABASE_OWNER_URL, { max: 1, onnotice: () => {} });
const [u] = await sql`select u.id, m.tenant_id, t.slug, t.name, t.short_name from users u join tenant_memberships m on m.user_id = u.id join tenants t on t.id = m.tenant_id where u.email = 'takase@seiran.example'`;
const viewer = { userId: u.id, name: "高瀬 遼", email: "takase@seiran.example", platformRole: "none", isDemo: true, role: "owner", tenant: { id: u.tenant_id, slug: u.slug, name: u.name, shortName: u.short_name, logoMark: "青", brandPrimary: "#1E3A5F", brandAccent: "#B08D57", role: "owner" }, memberships: [], sessionId: "" };
const [inc] = await sql`select id from incidents where organization_name like '東雲%'`;
for (const [kind, payload] of [["article_generate", { incidentId: inc.id }], ["collect", {}]]) {
  const [j] = await sql`insert into ai_jobs (kind, tenant_id, user_id, viewer, payload) values (${kind}, ${u.tenant_id}, ${u.id}, ${sql.json(viewer)}, ${sql.json(payload)}) returning id`;
  const bad = await fn(new Request("http://x", { method: "POST", body: JSON.stringify({ jobId: j.id, sig: "0".repeat(64) }) }));
  const t0 = Date.now();
  const res = await fn(new Request("http://x", { method: "POST", body: JSON.stringify({ jobId: j.id, sig: sig(j.id) }) }));
  const [done] = await sql`select status, jsonb_array_length(events) as events, result, error from ai_jobs where id = ${j.id}`;
  console.log(kind, "| bad sig ->", bad.status, "| ok ->", res.status, `${Date.now() - t0}ms`, "| status:", done.status, "| events:", done.events, "| result:", JSON.stringify(done.result).slice(0, 110), done.error ?? "");
}
await sql.end();

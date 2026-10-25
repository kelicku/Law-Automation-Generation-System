import postgres from "postgres";
const U = process.argv[2], CODE = process.argv[3];
let cookie = "";
async function call(method, path, body, h = {}) {
  const r = await fetch(U + path, { method, headers: { "content-type": "application/json", origin: U, cookie, ...h }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const sql = postgres("postgres://aiip_owner:aiip_owner_local@127.0.0.1:5435/aiip_demo", { onnotice: () => {} });
console.log("login", (await call("POST", "/api/auth/demo", { persona: "seiran-lawyer", code: CODE })).status);
const [inc] = await sql`select id from incidents where organization_name like '東雲%'`;
const t0 = Date.now();
const g = await call("POST", "/api/articles/generate", { incidentId: inc.id }, { "idempotency-key": "live-" + Date.now() });
console.log("generate", g.status, g.data.provider ?? g.data.error?.message, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (g.status !== 200) process.exit(1);
const a = await call("GET", `/api/articles/${g.data.articleId}`);
const c = a.data.article.working, p = a.data.precheck;
console.log("title:", c.title);
console.log("blocks:", c.blocks.length, "| evidence coverage:", p.evidence.coverage + "%", JSON.stringify(p.evidence.totals));
console.log("precheck:", p.items.map((i) => `${i.label}=${i.level}`).join(", "));
const facts = c.blocks.flatMap((b) => b.sentences ?? []).filter((s) => s.kind === "fact").slice(0, 2);
for (const s of facts) console.log("  fact:", s.text, "\n   quote:", s.refs[0]?.quote);
const [log] = await sql`select provider, model, status, input_tokens, output_tokens, cost_usd, duration_ms, prompt_version from ai_execution_logs where id = ${g.data.logId}`;
console.log("inspector log:", JSON.stringify(log));
const s = await call("POST", `/api/articles/${g.data.articleId}/assist`, { task: "seo_title" }, { "idempotency-key": "live-seo-" + Date.now() });
console.log("seo_title", s.status, s.data.provider, JSON.stringify(s.data.output ?? s.data.error));
await sql.end();

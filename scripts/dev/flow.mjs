// Drives the main API flow with real HTTP calls and prints results.
const base = process.env.BASE ?? "http://localhost:3100";
let cookie = "";
async function call(method, path, body, extra = {}) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", origin: base, cookie, ...extra }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return { status: res.status, data };
}
const log = (k, r) => console.log(k, r.status, JSON.stringify(r.data).slice(0, 300));
log("demo login", await call("POST", "/api/auth/demo", { persona: "seiran-lawyer" }));
// collect
const res = await fetch(base + "/api/collect", { method: "POST", headers: { origin: base, cookie } });
const text = await res.text();
for (const line of text.trim().split("\n")) { const e = JSON.parse(line); if (["step","done","error"].includes(e.type) || (e.type==="item")) console.log("  ", e.type, e.step ?? e.outcome ?? "", e.status ?? "", e.detail ?? e.message ?? JSON.stringify(e.stats ?? "")); else if (e.type==="source" && !e.ok) console.log("   source FAIL", e.name, e.error); }

// ── article workflow ──
const sql = (await import("postgres")).default("postgres://aiip_owner:aiip_owner_local@127.0.0.1:5435/aiip_demo");
const [inc] = await sql`select id from incidents where organization_name like '東雲%'`;
const gen = await call("POST", "/api/articles/generate", { incidentId: inc.id }, { "idempotency-key": "flowtest-" + Date.now() });
log("generate", gen);
const id = gen.data.articleId;
const dupKey = "dupkey-" + Date.now();
log("dup1", await call("POST", `/api/articles/${id}/assist`, { task: "seo_title" }, { "idempotency-key": dupKey }));
log("dup2 (same key)", await call("POST", `/api/articles/${id}/assist`, { task: "seo_title" }, { "idempotency-key": dupKey }));
let a = await call("GET", `/api/articles/${id}`);
const c = a.data.article.working; c.title = c.title + "（編集済み）";
log("autosave", await call("PATCH", `/api/articles/${id}`, { content: c, baseHash: a.data.article.working_hash }));
log("autosave stale hash", await call("PATCH", `/api/articles/${id}`, { content: c, baseHash: a.data.article.working_hash }));
log("publish before approval", await call("POST", `/api/articles/${id}/transition`, { action: "publish" }));
log("submit", await call("POST", `/api/articles/${id}/transition`, { action: "submit" }));
// editor cannot approve
log("switch editor", await call("POST", "/api/auth/demo", { persona: "seiran-editor" }));
log("editor approve", await call("POST", `/api/articles/${id}/transition`, { action: "approve" }));
log("switch firm B", await call("POST", "/api/auth/demo", { persona: "hiiragi-lawyer" }));
log("firmB read A article", await call("GET", `/api/articles/${id}`));
log("firmB approve A article", await call("POST", `/api/articles/${id}/transition`, { action: "approve" }));
log("relogin lawyer", await call("POST", "/api/auth/demo", { persona: "seiran-lawyer" }));
log("approve", await call("POST", `/api/articles/${id}/transition`, { action: "approve", comment: "OK" }));
log("publish", await call("POST", `/api/articles/${id}/transition`, { action: "publish" }));
const [art] = await sql`select slug from article_drafts where id = ${id}`;
let pub = await fetch(`${base}/sites/seiran-law/${art.slug}`); console.log("public page", pub.status);
log("suspend", await call("POST", `/api/articles/${id}/transition`, { action: "suspend" }));
pub = await fetch(`${base}/sites/seiran-law/${art.slug}`); console.log("public page after suspend", pub.status);
log("republish", await call("POST", `/api/articles/${id}/transition`, { action: "republish" }));
pub = await fetch(`${base}/sites/seiran-law/${art.slug}`); console.log("public page after republish", pub.status);
const sm = await (await fetch(`${base}/sites/seiran-law/sitemap.xml`)).text(); console.log("sitemap has page", sm.includes(art.slug));
log("csrf no origin", await (async () => { const r = await fetch(base + "/api/auth/logout", { method: "POST" }); return { status: r.status, data: await r.text() }; })());
await sql.end();

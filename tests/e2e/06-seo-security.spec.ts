import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { articleId, loginAs, origin, resetDb } from "./helpers";

test.beforeAll(async () => resetDb());

test("14. 公開ページのSEO情報（title / description / OGP / canonical / JSON-LD / sitemap）が生成される", async ({ page }) => {
  await page.goto("/sites/seiran-law/minato-seiki-data-breach");
  await expect(page).toHaveTitle(/ミナト精機.*青藍法律事務所/);
  const desc = await page.locator('meta[name="description"]').getAttribute("content");
  expect(desc?.length).toBeGreaterThan(40);
  expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toContain("ミナト精機");
  expect(await page.locator('meta[property="og:type"]').getAttribute("content")).toBe("article");
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toContain("/sites/seiran-law/minato-seiki-data-breach");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld["@graph"][0]["@type"]).toBe("Article");
  expect(ld["@graph"][0].publisher["@type"]).toBe("LegalService");
  await expect(page.getByTestId("public-sources")).toContainText("ミナト精機");
  await expect(page.getByTestId("fee-notice")).toContainText("費用");
  await expect(page.getByTestId("consult-link")).toHaveAttribute("href", /^https:\/\//);
  const sitemap = await (await page.request.get("/sites/seiran-law/sitemap.xml")).text();
  expect(sitemap).toContain("<urlset");
  expect(sitemap).toContain("minato-seiki-data-breach");
  expect(sitemap).not.toContain("aoba-life-subscription"); // draft is never listed
});

test("15. APIキーや接続情報がクライアントに露出しない", async ({ page }) => {
  const env = readFileSync(".env.local", "utf8");
  const secrets = env.split("\n").map((l) => l.split("=").slice(1).join("=").trim()).filter((v) => v.length >= 16);
  const pw = (u: string) => decodeURIComponent(new URL(u).password);
  for (const k of ["DATABASE_APP_URL", "DATABASE_WORKER_URL"]) {
    const v = env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1];
    if (v) secrets.push(pw(v));
  }
  expect(secrets.length).toBeGreaterThan(2);
  await loginAs(page, "seiran-lawyer");
  const id = await articleId("aoba-life-subscription");
  const bodies: string[] = [];
  page.on("response", async (r) => {
    const ct = r.headers()["content-type"] ?? "";
    if (/javascript|html|json/.test(ct)) bodies.push(await r.text().catch(() => ""));
  });
  for (const p of ["/", "/app", `/app/articles/${id}`, "/app/inspector", "/app/settings"]) await page.goto(p, { waitUntil: "networkidle" });
  const all = bodies.join("\n");
  expect(all.length).toBeGreaterThan(10_000);
  for (const s of secrets) expect(all).not.toContain(s);
  expect(all).not.toMatch(/sk-ant-[A-Za-z0-9]/);
  expect(all).not.toContain("DATABASE_WORKER_URL");
  expect(all).not.toContain("password_hash");
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "aiip_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
});

test("16. 不正な入力が安全に処理される", async ({ page }) => {
  await loginAs(page, "seiran-lawyer");
  const id = await articleId("aoba-life-subscription");
  let dialog = false;
  page.on("dialog", (d) => { dialog = true; void d.dismiss(); });
  // XSS payload stored as plain text
  const a = await (await page.request.get(`/api/articles/${id}`)).json();
  const payload = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
  const content = { ...a.article.working, title: payload };
  const saved = await page.request.patch(`/api/articles/${id}`, { data: { content, baseHash: a.article.working_hash }, headers: origin(page) });
  expect(saved.status()).toBe(200);
  await page.goto(`/app/articles/${id}`);
  await expect(page.getByTestId("article-title")).toHaveValue(payload);
  await page.goto(`/preview-frame/${id}?v=working`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("<img");
  expect(dialog).toBe(false);
  expect(await page.locator("img[src=x]").count()).toBe(0);
  // malformed / invalid input
  const bad = await page.request.fetch(`/api/articles/${id}`, { method: "PATCH", data: "{not json", headers: { ...origin(page), "content-type": "application/json" } });
  expect(bad.status()).toBe(400);
  const invalid = await page.request.patch(`/api/articles/${id}`, { data: { content: { title: 1 }, baseHash: "x" }, headers: origin(page) });
  expect(invalid.status()).toBe(400);
  const js = await page.request.patch(`/api/articles/${id}`, { data: { content: { ...content, links: [{ label: "x", url: "javascript:alert(1)" }] }, baseHash: "0".repeat(64) }, headers: origin(page) });
  expect(js.status()).toBe(400);
  expect((await page.request.get("/api/articles/not-a-uuid")).status()).toBe(404);
  const big = await page.request.post("/api/auth/login", { data: { email: "a@b.cd", password: "x".repeat(10_000) }, headers: origin(page) });
  expect([400, 413]).toContain(big.status());
  // SQL-ish search is just text
  await page.goto("/app/radar?q=%27%20OR%201%3D1%20--");
  await expect(page.getByTestId("radar-count")).toContainText("0件");
  // CSRF: state-changing request without matching Origin is rejected
  const csrf = await page.request.post("/api/demo/reset", { headers: { origin: "https://evil.example" } });
  expect(csrf.status()).toBe(403);
  // admin APIs are not reachable for firm users; unauthenticated users get 401
  expect((await page.request.post("/api/ops/sweep", { headers: origin(page) })).status()).toBe(403);
  const anon = await page.context().browser()!.newContext({ baseURL: `http://localhost:${process.env.E2E_PORT ?? 3200}` });
  expect((await anon.request.post("/api/collect", { headers: origin(page) })).status()).toBe(401);
  expect((await anon.request.get("/app/operations", { maxRedirects: 0 })).status()).toBe(307);
  await anon.close();
});

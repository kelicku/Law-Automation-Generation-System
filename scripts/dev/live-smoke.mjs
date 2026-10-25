// Browser smoke test against a deployed URL: invite link → one-click firm → collect → AI article → approve → publish → mobile.
import { chromium, devices } from "@playwright/test";
const [U, CODE, OUT] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "ja-JP" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror " + e.message));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
const t = async (label, fn) => { const s = Date.now(); try { const r = await fn(); console.log(`OK   ${label} (${((Date.now() - s) / 1000).toFixed(1)}s)${r ? " — " + r : ""}`); } catch (e) { console.log(`FAIL ${label} (${((Date.now() - s) / 1000).toFixed(1)}s) — ${String(e.message).split("\n")[0].slice(0, 160)}`); } };
await t("invite link + one-click firm", async () => {
  await page.goto(`${U}/invite/${CODE}`);
  await page.getByTestId("invite-ok").waitFor();
  await page.getByTestId("quick-new").click();
  await page.waitForURL(/\/app/, { timeout: 60000 });
  return await page.getByTestId("tenant-switcher").innerText().then((x) => x.split("\n")[0]);
});
await t("collection (real AI classify)", async () => {
  await page.goto(`${U}/app/radar`);
  await page.getByTestId("collect").click();
  await page.locator("[data-testid=collect-summary], [data-testid=collect-panel] [role=alert]").first().waitFor({ timeout: 300000 });
  return (await page.locator("[data-testid=collect-summary], [data-testid=collect-panel] [role=alert]").first().innerText()).slice(0, 90);
});
await t("AI article generation (real AI)", async () => {
  await page.goto(`${U}/app/radar?q=${encodeURIComponent("東雲")}`);
  await page.getByTestId("radar-row").first().locator("a").first().click();
  await page.getByTestId("generate-article").click();
  await Promise.race([
    page.waitForURL(/\/app\/articles\//, { timeout: 240000 }),
    page.getByTestId("ai-error").waitFor({ timeout: 240000 }).then(async () => { throw new Error("UI error: " + (await page.getByTestId("ai-error").innerText())); }),
  ]);
  return (await page.getByTestId("article-title").inputValue()).slice(0, 50);
});
await t("approve + publish", async () => {
  await page.getByTestId("tab-approval").click();
  await page.getByTestId("action-submit").click();
  await page.getByTestId("action-approve").click({ timeout: 30000 });
  await page.getByTestId("action-publish").click({ timeout: 30000 });
  await page.locator("[data-status=published]").first().waitFor({ timeout: 30000 });
});
await t("public page on smartphone", async () => {
  const m = await b.newContext({ ...devices["iPhone 13"] });
  const mp = await m.newPage();
  const firm = await page.request.get(`${U}/app/site`).then((r) => r.text()).then((h) => /\/sites\/(demo-[a-f0-9]+)/.exec(h)?.[1]);
  await mp.goto(`${U}/sites/${firm}`);
  await mp.getByTestId("public-list").locator("a").first().click();
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mp.screenshot({ path: `${OUT}/live-mobile.png` });
  if (ov > 1) throw new Error("overflow " + ov);
  return (await mp.getByRole("heading", { level: 1 }).innerText()).slice(0, 40);
});
await t("logout → one-click resume", async () => {
  await page.goto(`${U}/app`);
  await page.getByTestId("user-menu").click();
  await page.getByTestId("logout").click();
  await page.getByTestId("quick-resume").click();
  await page.waitForURL(/\/app$/);
});
console.log("5xx / page errors:", errors.length ? errors : "none");
await b.close();

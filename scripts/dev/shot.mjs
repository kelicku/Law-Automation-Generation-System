// Usage: node scripts/dev/shot.mjs <outdir> <persona|-> <width> <path...>
import { chromium } from "@playwright/test";
const [out, persona, width, ...paths] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3100";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
if (persona !== "-") {
  await page.goto(base + "/login");
  const r = await page.request.post(base + "/api/auth/demo", { data: { persona }, headers: { origin: base } });
  if (!r.ok()) console.log("login failed", r.status(), await r.text());
}
for (const p of paths) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const name = p.replace(/[^a-z0-9]+/gi, "_") || "root";
  await page.screenshot({ path: `${out}/${name}_${width}.png`, fullPage: true });
  console.log("shot", p);
}
if (errors.length) console.log("CONSOLE ERRORS:\n" + errors.join("\n"));
await browser.close();

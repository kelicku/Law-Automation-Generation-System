import { chromium } from "@playwright/test";
const base = "http://localhost:3300";
const [w, persona, ...paths] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: Number(w), height: 900 } }); const page = await ctx.newPage();
if (persona !== "-") await page.request.post(base + "/api/auth/demo", { data: { persona }, headers: { origin: base } });
for (const p of paths) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => { const W = window.innerWidth; const out = []; for (const el of document.querySelectorAll("body *")) { const rc = el.getBoundingClientRect(); if (rc.right > W + 1 && rc.width > 0) out.push(`${el.tagName}.${(el.className?.toString?.() ?? "").slice(0, 80)} right=${Math.round(rc.right)} w=${Math.round(rc.width)}`); } return out.slice(0, 8); });
  console.log(p, r);
}
await b.close();

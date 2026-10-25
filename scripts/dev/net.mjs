import { chromium } from "@playwright/test";
const b = await chromium.launch(); const page = await (await b.newContext()).newPage();
page.on("response", (r) => { if (r.status() >= 400) console.log(r.status(), r.request().method(), r.url()); });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" }); await page.waitForTimeout(2000);
await b.close();

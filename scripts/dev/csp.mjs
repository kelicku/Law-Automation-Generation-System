import { chromium } from "@playwright/test";
const base = "http://localhost:3000"; const [path] = process.argv.slice(2);
const b = await chromium.launch(); const page = await (await b.newContext()).newPage();
page.on("console", (m) => { if (/Content Security|CSP|Refused/i.test(m.text())) console.log(m.type(), m.text().slice(0, 300)); });
await page.request.post(base + "/api/auth/demo", { data: { persona: "seiran-lawyer" }, headers: { origin: base } });
await page.goto(base + path, { waitUntil: "networkidle" }); await page.waitForTimeout(1500); await b.close();

import { expect, test } from "@playwright/test";
import { articleId, loginAs, resetDb, trackErrors } from "./helpers";

test.beforeAll(async () => resetDb());

const VIEWPORTS = [
  { name: "PC", width: 1440, height: 900 },
  { name: "タブレット", width: 820, height: 1180 },
  { name: "スマートフォン", width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test(`13/19. ${vp.name}（${vp.width}px）で主要画面に横はみ出し・コンソールエラーがない`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errors = trackErrors(page);
    const minato = await articleId("minato-seiki-data-breach");
    const sakura = await articleId("sakura-juku-email-misdelivery");
    const publicPages = ["/", "/login", "/sites/seiran-law", "/sites/seiran-law/minato-seiki-data-breach", "/sites/hiiragi-law/koyo-financial-phishing"];
    for (const p of publicPages) {
      await page.goto(p, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${p} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await loginAs(page, "seiran-lawyer");
    const consolePages = ["/app", "/app/radar", "/app/articles", `/app/articles/${minato}`, `/app/articles/${minato}/evidence`, `/app/articles/${sakura}/diff`, `/app/articles/${minato}/preview`, "/app/approvals", "/app/site", "/app/inspector", "/app/savings", "/app/settings"];
    for (const p of consolePages) {
      await page.goto(p, { waitUntil: "networkidle" });
      await expect(page.locator("main h1, main [data-testid=article-title]").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${p} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await loginAs(page, "operator");
    await page.goto("/app/operations", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(errors, errors.join("\n")).toEqual([]);
    await ctx.close();
  });
}

import { expect, test } from "@playwright/test";
import { loginAs, query, resetDb } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => resetDb());

test.describe("2〜4. Incident Radar", () => {
  test("2. 検索・絞り込み・並び替えが動作する", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    await page.goto("/app/radar");
    await expect(page.getByTestId("radar-row")).toHaveCount(6);
    await page.getByTestId("radar-search").fill("北斗");
    await expect(page.getByTestId("radar-row")).toHaveCount(1);
    await expect(page.getByTestId("radar-row").first()).toContainText("北斗クラウドサービス");
    await page.getByTestId("radar-search").fill("");
    await expect(page.getByTestId("radar-row")).toHaveCount(6);
    await page.getByTestId("radar-category").selectOption("consumer_harm");
    await expect(page.getByTestId("radar-row")).toHaveCount(1);
    await page.getByTestId("radar-category").selectOption("all");
    await page.getByTestId("radar-material").check();
    await expect(page.getByTestId("radar-row")).toHaveCount(1);
    await expect(page.getByTestId("radar-row").first()).toContainText("さくら学習塾");
    await page.getByTestId("radar-material").uncheck();
    await expect(page.getByTestId("radar-row")).toHaveCount(6);
    await page.getByTestId("sort-title").click();
    await expect(page).toHaveURL(/sort=title/);
    const titles = await page.getByTestId("radar-row").locator("td:first-child a").allTextContents();
    expect([...titles].sort((a, b) => b.localeCompare(a))).toEqual(titles);
  });

  test("3. 情報収集の結果が保存され、取得失敗も表示される", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    await page.goto("/app/radar");
    await page.getByTestId("collect").click();
    await expect(page.getByTestId("collect-summary")).toContainText("新規事件 2件", { timeout: 45_000 });
    for (const step of ["fetch", "normalize", "dedupe", "classify", "save"]) {
      await expect(page.getByTestId(`step-${step}`)).toHaveAttribute("data-state", "done");
    }
    await expect(page.getByTestId("source-error")).toContainText("503");
    await expect(page.getByTestId("item-results")).toContainText("重要な続報");
    await expect(page.getByTestId("radar-row")).toHaveCount(8);
    await expect(page.getByTestId("radar-table")).toContainText("若葉ドラッグ");
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from incidents");
    expect(n).toBe(8);
    const [run] = await query<{ status: string }>("select status from collection_runs order by started_at desc limit 1");
    expect(run.status).toBe("partial");
    const flagged = await query("select id from sources where jsonb_array_length(injection_flags) > 0");
    expect(flagged.length).toBeGreaterThan(0);
  });

  test("4. 再収集しても重複した事件は登録されない", async ({ page }) => {
    const before = await query<{ i: number; s: number }>("select (select count(*)::int from incidents) as i, (select count(*)::int from sources) as s");
    await loginAs(page, "seiran-lawyer");
    await page.goto("/app/radar");
    await page.getByTestId("collect").click();
    await expect(page.getByTestId("collect-summary")).toContainText("新規事件 0件", { timeout: 45_000 });
    await expect(page.getByTestId("collect-summary")).toContainText("重複除外 15件");
    const after = await query<{ i: number; s: number }>("select (select count(*)::int from incidents) as i, (select count(*)::int from sources) as s");
    expect(after).toEqual(before);
  });
});

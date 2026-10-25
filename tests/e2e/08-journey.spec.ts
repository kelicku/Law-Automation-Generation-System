import { expect, test } from "@playwright/test";
import { query, resetDb } from "./helpers";

test.beforeAll(async () => resetDb());

test("One-Click Demo Journey: 7つの手順が実際の操作で進行する", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/invite/e2e-code");
  await page.goto("/");
  await page.getByTestId("landing-demo").click();
  const guide = page.getByRole("complementary", { name: "デモガイド" });
  await expect(guide).toContainText("手順 1 / 7");
  await guide.getByRole("link", { name: "この画面へ移動" }).click();
  await expect(guide).toContainText("手順 2 / 7");
  await page.getByTestId("source-toggle").first().click();
  await expect(guide).toContainText("手順 3 / 7");
  await page.getByTestId("generate-article").click();
  await expect(page).toHaveURL(/\/app\/articles\//, { timeout: 30_000 });
  await expect(guide).toContainText("手順 4 / 7");
  await page.getByTestId("article-summary").fill("東雲モビリティ（架空）が公表した位置情報の取得に関する事案について、公表情報をもとに概要と確認すべき点を整理します。");
  await expect(guide).toContainText("手順 5 / 7", { timeout: 15_000 });
  await page.getByTestId("run-precheck").click();
  await expect(guide).toContainText("手順 6 / 7");
  await page.getByTestId("tab-approval").click();
  await page.getByTestId("action-submit").click();
  await page.getByTestId("action-approve").click();
  await expect(guide).toContainText("手順 7 / 7");
  await page.getByTestId("action-publish").click();
  await expect(page.locator("[data-status=published]").first()).toBeVisible();
  await page.getByTestId("open-preview").click();
  await expect(guide).toContainText("すべての手順を体験しました");
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from published_pages p join incidents i on i.id = p.incident_id where i.organization_name like '東雲%'");
  expect(n).toBe(1);
});

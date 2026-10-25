import { expect, test } from "@playwright/test";
import { loginAs, origin, query, resetDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => resetDb());

test.describe("17〜18. Operations Center", () => {
  test("運営者以外は運営APIを実行できない", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    expect((await page.request.post("/api/ops/backup", { headers: origin(page) })).status()).toBe(403);
    await page.goto("/app/operations");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("運営者のみ");
  });

  test("17. 契約期限が近づくと事務所と運営者に通知される", async ({ page }) => {
    await loginAs(page, "operator");
    await page.goto("/app/operations");
    await expect(page.getByTestId("days-left-hiiragi-law")).toContainText("残り12日");
    const [seiran] = await query<{ id: string }>("select id from tenants where slug = 'seiran-law'");
    await page.getByTestId(`contract-14-${seiran.id}`).click();
    await expect(page.getByTestId("days-left-seiran-law")).toContainText("残り14日");
    await expect(page.getByTestId("ops-notifications")).toContainText("青藍法律事務所 の契約期限まで残り14日");
    await loginAs(page, "seiran-lawyer");
    await page.goto("/app");
    await page.getByTestId("notifications").click();
    await expect(page.getByTestId("notification-list")).toContainText("ご契約の更新期限が近づいています（残り14日）");
  });

  test("18. AI利用量の上限に達すると新規AI処理が拒否される", async ({ page }) => {
    await loginAs(page, "operator");
    await page.goto("/app/operations");
    const [hiiragi] = await query<{ id: string }>("select id from tenants where slug = 'hiiragi-law'");
    await page.getByTestId(`limit-cap-${hiiragi.id}`).click();
    await expect(page.getByTestId("ops-tenants")).toContainText("上限到達・停止中");
    await loginAs(page, "hiiragi-lawyer");
    const [art] = await query<{ id: string }>("select id from article_drafts where slug = 'hiiragi-law-x' or slug = 'minato-seiki-leak-guide'");
    await page.goto(`/app/articles/${art.id}`);
    await page.getByRole("tab", { name: "AIアシスタント" }).click();
    await page.getByTestId("assist-sns").click();
    await expect(page.getByTestId("ai-error")).toContainText("上限");
    const [log] = await query<{ status: string }>("select status from ai_execution_logs l join tenants t on t.id = l.tenant_id where t.slug = 'hiiragi-law' order by l.created_at desc limit 1");
    expect(log.status).toBe("rejected_limit");
  });

  test("バックアップは実行して初めて成功と表示される", async ({ page }) => {
    await loginAs(page, "operator");
    await page.goto("/app/operations");
    await expect(page.getByTestId("backup-status")).toContainText("未実行");
    await page.getByTestId("run-backup").click();
    await expect(page.getByTestId("backup-status")).toContainText("成功", { timeout: 20_000 });
    const [b] = await query<{ status: string; size_bytes: string }>("select status, size_bytes from backup_runs order by started_at desc limit 1");
    expect(b.status).toBe("succeeded");
    expect(Number(b.size_bytes)).toBeGreaterThan(1000);
  });
});

import { expect, test } from "@playwright/test";
import { articleId, loginAs, origin, query, resetDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => resetDb());

test.describe("5〜7. AI記事生成とエディタ", () => {
  test("5. AI記事生成が完了し、出典付きの記事がエディタに表示される", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    const [inc] = await query<{ id: string }>("select id from incidents where organization_name like '東雲%'");
    await page.goto(`/app/incidents/${inc.id}`);
    await page.getByTestId("generate-article").click();
    await expect(page).toHaveURL(/\/app\/articles\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByTestId("article-title")).toHaveValue(/東雲モビリティ/);
    await expect(page.locator("[data-evidence=verified]").first()).toBeVisible();
    const [log] = await query<{ status: string; provider: string }>("select status, provider from ai_execution_logs where task = 'article_generate' order by created_at desc limit 1");
    expect(log.status).toBe("succeeded");
    // evidence trace highlights the cited quote
    await page.getByTestId("open-evidence").click();
    await page.getByTestId("claim").first().click();
    await expect(page.getByTestId("evidence-highlight").first()).toBeVisible();
    await expect(page.getByTestId("selected-claim")).toContainText("出典と一致");
  });

  test("7. 編集内容が自動保存され、再読み込み後も維持される", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    const id = await articleId("aoba-life-subscription");
    await page.goto(`/app/articles/${id}`);
    const title = page.getByTestId("article-title");
    await title.fill("青葉ライフ通販の定期購入トラブル ― 返金の受付について（編集テスト）");
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    // paragraph edit
    const para = page.getByTestId("paragraph").first();
    await para.hover();
    await para.getByTestId("edit-paragraph").click();
    const editor = page.getByTestId("paragraph-editor");
    await editor.fill(`${await editor.inputValue()}この一文は編集テストで追加しました。`);
    await page.getByTestId("article-summary").click();
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved", { timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId("article-title")).toHaveValue(/編集テスト/);
    await expect(page.getByTestId("article-body")).toContainText("この一文は編集テストで追加しました。");
    // the edited sentence has no evidence → flagged
    await expect(page.locator("[data-evidence=unsourced]")).toContainText("この一文は編集テストで追加しました。");
  });

  test("6. AI APIエラー時に適切なメッセージを表示し、再試行できる", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    await page.goto("/app/settings");
    await page.getByTestId("toggle-ai-failure").click();
    await page.getByTestId("save-settings").click();
    await expect(page.getByText("事務所設定を保存しました")).toBeVisible();
    const id = await articleId("aoba-life-subscription");
    await page.goto(`/app/articles/${id}`);
    await page.getByRole("tab", { name: "AIアシスタント" }).click();
    await page.getByTestId("assist-meta").click();
    await expect(page.getByTestId("ai-error")).toContainText("AI APIが応答しませんでした");
    const [log] = await query<{ status: string; error_code: string }>("select status, error_code from ai_execution_logs order by created_at desc limit 1");
    expect(log).toEqual({ status: "failed", error_code: "AI_PROVIDER_ERROR" });
    // restore and retry succeeds
    await page.request.patch("/api/settings", {
      headers: origin(page),
      data: await (async () => {
        const [s] = await query<Record<string, unknown>>("select firm_display_name, tagline, lawyers, consultation_form_url, fee_notice, address, phone, office_hours from tenant_settings t join tenants x on x.id = t.tenant_id where x.slug = 'seiran-law'");
        return { ...s, simulate_ai_failure: false };
      })(),
    });
    await page.getByTestId("assist-meta").click();
    await expect(page.getByTestId("seo-description").or(page.getByText("メタディスクリプションに反映しました")).first()).toBeVisible();
    await expect(page.getByTestId("ai-error")).toHaveCount(0);
  });
});

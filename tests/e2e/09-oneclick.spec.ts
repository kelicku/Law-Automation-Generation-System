import { expect, test } from "@playwright/test";
import { articleId, origin, query, resetDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => resetDb());

test.describe("ワンクリックのログイン・登録", () => {
  test("招待リンク → ボタンだけで専用デモ事務所を作成 → ログアウト後もボタンだけで再開", async ({ page }) => {
    // without an invitation the code is requested
    await page.goto("/login");
    await expect(page.getByTestId("demo-code")).toBeVisible();
    await page.getByTestId("quick-new").click();
    await expect(page.getByTestId("quick-error")).toContainText("招待リンク");
    // a wrong invitation is rejected
    await page.goto("/invite/wrong-code");
    await expect(page).toHaveURL(/invite=invalid/);
    // the right invitation: no typing from here on
    await page.goto("/invite/e2e-code");
    await expect(page.getByTestId("invite-ok")).toBeVisible();
    await expect(page.getByTestId("demo-code")).toHaveCount(0);
    await page.getByTestId("quick-new").click();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByTestId("tenant-switcher")).toContainText("（架空・体験用）");
    await expect(page.getByRole("complementary", { name: "デモガイド" })).toBeVisible();
    const [sb] = await query<{ tenant_id: string; n: number }>(
      "select s.tenant_id, (select count(*)::int from article_drafts a where a.tenant_id = s.tenant_id) as n from sandbox_accounts s order by created_at desc limit 1");
    expect(sb.n).toBe(2);
    const cookies = await page.context().cookies();
    for (const name of ["aiip_resume", "aiip_demo_grant", "aiip_session"]) expect(cookies.find((c) => c.name === name)?.httpOnly, name).toBe(true);

    // log out → one-click resume of the same firm
    await page.getByTestId("user-menu").click();
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("おかえりなさい");
    await page.getByTestId("quick-resume").click();
    await expect(page).toHaveURL(/\/app$/);
    const [tenant] = await query<{ short_name: string }>("select short_name from tenants where id = $1", [sb.tenant_id]);
    await expect(page.getByTestId("tenant-switcher")).toContainText(tenant.short_name);

    // landing CTA also resumes with one click
    await page.getByTestId("user-menu").click();
    await page.getByTestId("logout").click();
    await page.goto("/");
    await page.getByTestId("landing-demo").click();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByTestId("tenant-switcher")).toContainText(tenant.short_name);
  });

  test("専用デモ事務所は他の事務所のデータを見られず、デモ全体の初期化もできない", async ({ page }) => {
    await page.goto("/invite/e2e-code");
    await page.getByTestId("quick-new").click();
    await expect(page).toHaveURL(/\/app/);
    const seiranDraft = await articleId("aoba-life-subscription");
    expect((await page.request.get(`/api/articles/${seiranDraft}`)).status()).toBe(404);
    await page.goto("/app/articles");
    await expect(page.getByTestId("articles-table")).not.toContainText("ミナト精機");
    expect((await page.request.post("/api/demo/reset", { headers: origin(page) })).status()).toBe(403);
    // switch to a shared account and back to the own firm, clicks only
    await page.getByTestId("tenant-switcher").click();
    await page.getByTestId("persona-seiran-lawyer").click();
    await expect(page.getByTestId("tenant-switcher")).toContainText("青藍法律事務所");
    await page.getByTestId("tenant-switcher").click();
    await page.getByTestId("persona-own").click();
    await expect(page.getByTestId("tenant-switcher")).toContainText("（架空・体験用）");
  });
});

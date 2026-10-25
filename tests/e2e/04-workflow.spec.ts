import { expect, test } from "@playwright/test";
import { articleId, loginAs, origin, query, resetDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => resetDb());

async function generateShinonome(page: import("@playwright/test").Page) {
  const [inc] = await query<{ id: string }>("select id from incidents where organization_name like '東雲%'");
  const r = await page.request.post("/api/articles/generate", { data: { incidentId: inc.id }, headers: { ...origin(page), "idempotency-key": `e2e-${Date.now()}` } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).articleId as string;
}

test.describe("8〜12. 承認ワークフローと公開", () => {
  let id: string;
  let slug: string;

  test("8. 未承認の記事は公開できない（API直接呼び出しも拒否）", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    id = await generateShinonome(page);
    [{ slug }] = await query<{ slug: string }>("select slug from article_drafts where id = $1", [id]);
    const r = await page.request.post(`/api/articles/${id}/transition`, { data: { action: "publish" }, headers: origin(page) });
    expect(r.status()).toBe(409);
    expect((await page.request.get(`/sites/seiran-law/${slug}`)).status()).toBe(404);
    // editors cannot approve even when calling the API directly
    await page.request.post(`/api/articles/${id}/transition`, { data: { action: "submit" }, headers: origin(page) });
    await loginAs(page, "seiran-editor");
    const denied = await page.request.post(`/api/articles/${id}/transition`, { data: { action: "approve" }, headers: origin(page) });
    expect(denied.status()).toBe(403);
    const [{ n }] = await query<{ n: number }>("select count(*)::int as n from published_pages where article_id = $1", [id]);
    expect(n).toBe(0);
  });

  test("9. 公開前チェック → 承認 → 公開 で承認済みの記事だけが公開される", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    await page.goto(`/app/articles/${id}`);
    await page.getByTestId("run-precheck").click();
    await expect(page.getByTestId("precheck-items").locator("[data-level=blocking]")).toHaveCount(0);
    await page.getByTestId("tab-approval").click();
    await page.getByTestId("action-approve").click();
    await expect(page.getByTestId("action-publish")).toBeVisible();
    await page.getByTestId("action-publish").click();
    await expect(page.getByTestId("approval-records")).toContainText("承認");
    await expect(page.locator("[data-status=published]").first()).toBeVisible();
    const [ap] = await query<{ decision: string; approver: string; version_no: number }>(
      "select a.decision, u.display_name as approver, v.version_no from approvals a join users u on u.id = a.approver_id join article_versions v on v.id = a.version_id where a.article_id = $1", [id]);
    expect(ap.decision).toBe("approved");
    expect(ap.approver).toBe("高瀬 遼");
    expect(ap.version_no).toBeGreaterThan(0);
    await page.goto(`/sites/seiran-law/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("東雲モビリティ");
  });

  test("10. 公開停止と再公開が公開サイトに反映される", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    page.on("dialog", (d) => d.accept());
    await page.goto(`/app/articles/${id}`);
    await page.getByTestId("tab-approval").click();
    await page.getByTestId("action-suspend").click();
    await expect(page.locator("[data-status=suspended]").first()).toBeVisible();
    expect((await page.request.get(`/sites/seiran-law/${slug}`)).status()).toBe(404);
    const sitemap = await (await page.request.get("/sites/seiran-law/sitemap.xml")).text();
    expect(sitemap).not.toContain(slug);
    await page.getByTestId("tab-approval").click();
    await page.getByTestId("action-republish").click();
    await expect(page.locator("[data-status=published]").first()).toBeVisible();
    expect((await page.request.get(`/sites/seiran-law/${slug}`)).status()).toBe(200);
  });

  test("11. 別事務所の非公開データにはアクセスできない", async ({ page }) => {
    const draftA = await articleId("aoba-life-subscription");
    await loginAs(page, "hiiragi-lawyer");
    expect((await page.request.get(`/api/articles/${draftA}`)).status()).toBe(404);
    expect((await page.request.post(`/api/articles/${draftA}/transition`, { data: { action: "archive" }, headers: origin(page) })).status()).toBe(404);
    expect((await page.request.patch(`/api/articles/${draftA}`, { data: { content: {}, baseHash: "0".repeat(64) }, headers: origin(page) })).status()).not.toBe(200);
    const res = await page.goto(`/app/articles/${draftA}`);
    expect(res?.status()).toBe(404);
    // the tenant switcher changes the data shown
    await page.goto("/app/articles");
    await expect(page.getByTestId("articles-table")).not.toContainText("青葉ライフ通販");
    await expect(page.getByTestId("articles-table")).toContainText("光陽フィナンシャル");
    await page.getByTestId("tenant-switcher").click();
    await page.getByTestId("persona-seiran-lawyer").click();
    await expect(page.getByTestId("tenant-switcher")).toContainText("青藍法律事務所");
    await page.goto("/app/articles");
    await expect(page.getByTestId("articles-table")).toContainText("青葉ライフ通販");
    // public sites differ in design
    const a = await page.request.get("/sites/seiran-law");
    const b = await page.request.get("/sites/hiiragi-law");
    expect(await a.text()).toContain("#1E3A5F");
    expect(await b.text()).toContain("#23453B");
  });

  test("12. 続報で更新案が作られても、公開版は承認なしに上書きされない", async ({ page }) => {
    await loginAs(page, "seiran-lawyer");
    const minato = await articleId("minato-seiki-data-breach");
    await page.goto("/app/radar");
    await page.getByTestId("collect").click();
    await expect(page.getByTestId("collect-summary")).toContainText("重要な変更 1件", { timeout: 45_000 });
    const [a] = await query<{ status: string; pending: boolean }>("select status, pending_update is not null as pending from article_drafts where id = $1", [minato]);
    expect(a).toEqual({ status: "revision_required", pending: true });
    const pub = await (await page.request.get("/sites/seiran-law/minato-seiki-data-breach")).text();
    expect(pub).toContain("現在調査中");
    expect(pub).not.toContain("12,400");
    await page.goto(`/app/articles/${minato}/diff`);
    await expect(page.getByTestId("material-change")).toContainText("12,400");
    await expect(page.getByTestId("smart-diff").locator("[data-diff=modified]").first()).toBeVisible();
    // publishing the proposal still requires submit → approve
    const r = await page.request.post(`/api/articles/${minato}/transition`, { data: { action: "publish" }, headers: origin(page) });
    expect(r.status()).toBe(409);
  });
});

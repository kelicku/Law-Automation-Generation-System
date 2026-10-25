import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test.describe("1. ログインとログアウト", () => {
  test("フォームでログインし、ログアウトすると管理画面に入れなくなる", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("メールアドレス").fill("takase@seiran.example");
    await page.getByLabel("パスワード", { exact: true }).fill("Demo-Seiran-Lawyer-2026");
    await page.locator("form").getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("青藍法律事務所");
    await page.getByTestId("user-menu").click();
    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/app/radar");
    await expect(page).toHaveURL(/\/login$/);
    const r = await page.request.get("/api/articles/00000000-0000-4000-8000-000000000000");
    expect(r.status()).toBe(401);
    expect(errors).toEqual([]);
  });

  test("誤ったパスワードではエラーを表示する", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill("takase@seiran.example");
    await page.getByLabel("パスワード", { exact: true }).fill("wrong-password");
    await page.locator("form").getByRole("button", { name: "ログイン" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("正しくありません");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("ログイン画面：パスワード表示切替とデモ用アカウントでの入室", async ({ page }) => {
    await page.goto("/login");
    const pw = page.getByLabel("パスワード", { exact: true });
    await pw.fill("secret-value");
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "入力した文字を表示" }).click();
    await expect(pw).toHaveAttribute("type", "text");
    await page.goto("/invite/e2e-code");
    await page.getByTestId("toggle-shared").click();
    await page.getByTestId("demo-login-hiiragi-lawyer").click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId("tenant-switcher")).toContainText("柊総合法律事務所");
  });

  test("ランディングの「デモを体験する」でガイド付きデモが始まる", async ({ page }) => {
    await page.goto("/invite/e2e-code");
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("事件情報の発見から");
    await page.getByTestId("landing-demo").click();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole("complementary", { name: "デモガイド" })).toContainText("事件情報を確認する");
  });
});

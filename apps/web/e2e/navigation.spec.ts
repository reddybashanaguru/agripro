import { test, expect } from "@playwright/test";

test.describe("Navigation & Skip-nav", () => {
  test("skip-nav link is present and points to main content", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveText(/Skip to main content/i);
  });

  test("skip-nav link is visible when focused", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeFocused();
  });

  test("nav links render for all main routes", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav).toBeVisible();
    // Check the brand link
    await expect(page.getByRole("link", { name: /Finagra Unity/i })).toBeVisible();
  });

  test("current page link has aria-current=page on dashboard", async ({ page }) => {
    await page.goto("/");
    const currentLinks = page.locator('[aria-current="page"]');
    await expect(currentLinks.first()).toBeVisible();
  });

  test("current page link has aria-current=page on ledger", async ({ page }) => {
    await page.goto("/ledger");
    const currentLinks = page.locator('[aria-current="page"]');
    await expect(currentLinks.first()).toBeVisible();
  });

  test("current page link has aria-current=page on transactions", async ({ page }) => {
    await page.goto("/transactions");
    const currentLinks = page.locator('[aria-current="page"]');
    await expect(currentLinks.first()).toBeVisible();
  });

  test("current page link has aria-current=page on sentinel", async ({ page }) => {
    await page.goto("/sentinel");
    const currentLinks = page.locator('[aria-current="page"]');
    await expect(currentLinks.first()).toBeVisible();
  });

  test("clicking nav link navigates to ledger page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Ledger/i }).click();
    await expect(page).toHaveURL(/\/ledger/);
    await expect(
      page.getByRole("heading", { name: "Ledger Audit" })
    ).toBeVisible();
  });

  test("clicking nav link navigates to transactions page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Transactions/i }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(
      page.getByRole("heading", { name: "Transactions" })
    ).toBeVisible();
  });

  test("footer copyright is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Finagra Unity.*Investor Command Center/)).toBeVisible();
  });
});

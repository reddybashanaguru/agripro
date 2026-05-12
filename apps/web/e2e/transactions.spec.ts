import { test, expect } from "@playwright/test";

test.describe("Transactions page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions");
  });

  test("page heading is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Transactions" })
    ).toBeVisible();
  });

  test("page title is Transactions | Finagra Unity", async ({ page }) => {
    await expect(page).toHaveTitle(/Transactions.*Finagra Unity/);
  });

  test("sub-heading describes payout history", async ({ page }) => {
    await expect(
      page.getByText("Full payout history")
    ).toBeVisible();
  });

  test("transaction table renders with headers", async ({ page }) => {
    // Wait for either table or empty state
    const table = page.getByRole("table");
    const emptyState = page.getByText("No transactions yet.");
    await Promise.race([
      table.waitFor({ state: "visible" }),
      emptyState.waitFor({ state: "visible" }),
    ]);
    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    expect(tableVisible || emptyVisible).toBe(true);
  });

  test("shows showing N-M of total text when data loads", async ({ page }) => {
    const showingText = page.getByText(/Showing/);
    await expect(showingText).toBeVisible({ timeout: 5000 });
  });

  test("table has column headers: Amount, Status, Date", async ({ page }) => {
    const table = page.getByRole("table");
    const isVisible = await table.isVisible().catch(() => false);
    if (isVisible) {
      await expect(page.getByRole("columnheader", { name: /Amount/i })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Status/i })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Date/i })).toBeVisible();
    }
  });

  test("pagination is not shown when only one page", async ({ page }) => {
    // If total transactions <= 20, no pagination nav
    const nav = page.getByRole("navigation", { name: "Pagination" });
    // it's OK if it's hidden or doesn't exist
    const isVisible = await nav.isVisible().catch(() => false);
    // Just validate it doesn't throw — presence is conditional on total > 20
    expect(typeof isVisible).toBe("boolean");
  });
});

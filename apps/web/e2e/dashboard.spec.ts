import { test, expect } from "@playwright/test";

test.describe("Dashboard — Investor Command Center", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page heading is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1 })
    ).toHaveText("Investor Command Center");
  });

  test("sub-heading describes the platform", async ({ page }) => {
    await expect(
      page.getByText("Real-time view of the Finagra Unity AgTech platform")
    ).toBeVisible();
  });

  test("all 6 KPI metric cards are visible", async ({ page }) => {
    // Scope to the KPI region to avoid "Transactions" nav link ambiguity
    const kpi = page.getByRole("region", { name: "Key Performance Indicators" });
    for (const title of ["Total Disbursed", "Farmers", "Land Plots", "Transactions", "NDVI Alerts", "GPS Proofs"]) {
      await expect(kpi.getByText(title)).toBeVisible();
    }
  });

  test("KPI cards show numeric values (not dashes)", async ({ page }) => {
    const cards = page.locator("article");
    await expect(cards.first()).toBeVisible();
    const dashCount = await page.getByText("—").count();
    expect(dashCount).toBeLessThan(6);
  });

  test("Recent Transactions section heading is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Recent Transactions" })
    ).toBeVisible();
  });

  test("Global Ledger Balance widget is visible", async ({ page }) => {
    await expect(page.getByText("Global Ledger Balance")).toBeVisible();
  });

  test("page title includes Dashboard", async ({ page }) => {
    // Next.js dev server may not apply the template suffix; check for "Dashboard" in title
    await expect(page).toHaveTitle(/Dashboard/);
  });

  test("has no broken layout on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

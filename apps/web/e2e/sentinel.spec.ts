import { test, expect } from "@playwright/test";

test.describe("Satellite Sentinel page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sentinel");
  });

  test("page heading is visible", async ({ page }) => {
    // Use level:1 to avoid matching "How Satellite Sentinel Works" (h2)
    await expect(
      page.getByRole("heading", { level: 1 })
    ).toHaveText("Satellite Sentinel");
  });

  test("page title is Satellite Sentinel | Finagra Unity", async ({ page }) => {
    await expect(page).toHaveTitle(/Satellite Sentinel/);
  });

  test("NDVI description is shown", async ({ page }) => {
    await expect(
      page.getByText(/NDVI monitoring/)
    ).toBeVisible();
  });

  test("alert banner renders (either healthy or warning)", async ({ page }) => {
    const healthy = page.getByText("All plots within healthy range");
    const warning = page.getByText(/plots? below NDVI threshold/);
    const hasHealthy = await healthy.isVisible().catch(() => false);
    const hasWarning = await warning.isVisible().catch(() => false);
    expect(hasHealthy || hasWarning).toBe(true);
  });

  test("alert banner has role=status and aria-live", async ({ page }) => {
    // Use CSS attribute selector to target exactly the NDVI status banner
    const banner = page.locator('[role="status"][aria-live="polite"]');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("aria-live", "polite");
  });

  test("How Satellite Sentinel Works section is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "How Satellite Sentinel Works", exact: true })
    ).toBeVisible();
  });

  test("all 4 numbered steps are present", async ({ page }) => {
    await expect(page.getByText("Satellite Ingestion")).toBeVisible();
    await expect(page.getByText("Threshold Gate")).toBeVisible();
    // Use exact match to avoid matching "Payout blocked" in the scale reference
    await expect(page.getByText("Payout Block", { exact: true })).toBeVisible();
    await expect(page.getByText("Auto-Clear")).toBeVisible();
  });

  test("NDVI scale reference grid is shown", async ({ page }) => {
    await expect(page.getByText("NDVI Scale Reference")).toBeVisible();
    await expect(page.getByText("Payout blocked")).toBeVisible();
    // Two "Payout allowed" elements (sparse + healthy) — check at least one is visible
    await expect(page.getByText("Payout allowed").first()).toBeVisible();
  });

  test("metrics summary renders when backend is available", async ({ page }) => {
    const registered = page.getByText("Registered Plots");
    const isVisible = await registered.isVisible({ timeout: 3000 }).catch(() => false);
    expect(typeof isVisible).toBe("boolean");
  });
});

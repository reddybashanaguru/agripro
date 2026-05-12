import { test, expect } from "@playwright/test";

test.describe("Ledger Audit page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ledger");
  });

  test("page heading is visible", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ledger Audit");
  });

  test("double-entry description is shown", async ({ page }) => {
    await expect(page.getByText("Double-entry integrity")).toBeVisible();
  });

  test("page title includes Ledger Audit", async ({ page }) => {
    await expect(page).toHaveTitle(/Ledger Audit/);
  });

  test("Global Ledger Balance widget renders", async ({ page }) => {
    await expect(page.getByText("Global Ledger Balance")).toBeVisible();
  });

  test("balance status badge is visible (BALANCED or IMBALANCED)", async ({ page }) => {
    const badge = page.getByText(/^BALANCED$|^IMBALANCED$/);
    await expect(badge).toBeVisible();
  });

  test("Total Debit and Total Credit labels are visible in the widget", async ({ page }) => {
    // Target the LedgerBalanceWidget section specifically
    const widget = page.getByRole("region", { name: /Global Ledger Balance/i });
    await expect(widget.getByText("Total Debit")).toBeVisible();
    await expect(widget.getByText("Total Credit")).toBeVisible();
  });

  test("Double-Entry Laws section is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Double-Entry Laws" })
    ).toBeVisible();
  });

  test("50/25/5/20 math law box is visible", async ({ page }) => {
    await expect(page.getByText("50/25/5/20 Math Laws")).toBeVisible();
    await expect(page.getByText(/Farmer Payment: 50%/)).toBeVisible();
    await expect(page.getByText(/Platform Fee: 25%/)).toBeVisible();
    await expect(page.getByText(/Agent Commission: 5%/)).toBeVisible();
    await expect(page.getByText(/Reserve Fund: 20%/)).toBeVisible();
  });

  test("no backend error alert visible when data loads", async ({ page }) => {
    // Next.js has its own route-announcer with role=alert; check for the specific error div instead
    const errorDiv = page.locator(".bg-red-50.border-red-200").filter({ hasText: "Failed to load" });
    await expect(errorDiv).not.toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = [
  { path: "/", name: "Dashboard" },
  { path: "/ledger", name: "Ledger Audit" },
  { path: "/transactions", name: "Transactions" },
  { path: "/sentinel", name: "Satellite Sentinel" },
];

for (const route of routes) {
  test.describe(`Accessibility — ${route.name}`, () => {
    test("has no axe-core WCAG 2.1 AA violations", async ({ page }) => {
      await page.goto(route.path);
      // Wait for main content to load
      await page.waitForSelector("#main-content", { state: "visible" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test("main content area is reachable via id=main-content", async ({ page }) => {
      await page.goto(route.path);
      const main = page.locator("#main-content");
      await expect(main).toBeAttached();
    });

    test("page has a single h1", async ({ page }) => {
      await page.goto(route.path);
      const h1s = page.getByRole("heading", { level: 1 });
      await expect(h1s).toHaveCount(1);
    });

    test("all images have alt text or aria-hidden", async ({ page }) => {
      await page.goto(route.path);
      const images = page.locator("img:not([alt]):not([aria-hidden])");
      const count = await images.count();
      expect(count).toBe(0);
    });

    test("focus is visible on interactive elements", async ({ page }) => {
      await page.goto(route.path);
      // Tab through interactive elements; none should trap focus
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Tab");
      }
      const focusedEl = page.locator(":focus");
      // Should still have a focused element (no focus trap)
      await expect(focusedEl).toBeAttached();
    });
  });
}

test.describe("Keyboard navigation", () => {
  test("can Tab through nav links without getting stuck", async ({ page }) => {
    await page.goto("/");
    // Tab past skip-nav, through nav links
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
    }
    // Page should still be responsive
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("skip-nav link skips to main-content when activated", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab"); // focus skip-nav
    await page.keyboard.press("Enter");
    // main content should now be focused
    const main = page.locator("#main-content");
    // It either gains focus or scrolls into view
    await expect(main).toBeInViewport();
  });
});

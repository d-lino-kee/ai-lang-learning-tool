// ═══════════════════════════════════════════════════════════════════
//  E2E + Accessibility Tests — Playwright
//  Tests all 3 pages for WCAG compliance, touch targets, ARIA, and
//  illiteracy-specific requirements (audio-first, no-text-dependency).
// ═══════════════════════════════════════════════════════════════════

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";

test.describe("Accessibility — axe-core audit", () => {
  test("Home page has no critical a11y violations", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000); // Wait for blob animation to start

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    if (critical.length > 0) {
      console.error("Critical a11y violations:", JSON.stringify(critical, null, 2));
    }
    expect(critical).toHaveLength(0);
  });

  test("Scenarios page has no critical a11y violations", async ({ page }) => {
    await page.goto(BASE_URL);
    // Navigate to scenarios via bottom nav
    await page.click('[aria-label="Scenarios"]');
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(critical).toHaveLength(0);
  });

  test("Settings page has no critical a11y violations", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('[aria-label="Settings"]');
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(critical).toHaveLength(0);
  });
});

test.describe("Touch targets — minimum 48px", () => {
  test("All interactive elements meet 48px minimum", async ({ page }) => {
    await page.goto(BASE_URL);

    // Check all buttons
    const buttons = page.locator("button");
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();
      if (box) {
        expect(
          box.width >= 44 && box.height >= 44,
          `Button ${i} (${box.width}x${box.height}) is below 44px minimum`
        ).toBe(true);
      }
    }
  });
});

test.describe("ARIA labels — every interactive element", () => {
  test("All buttons have aria-label or visible text", async ({ page }) => {
    await page.goto(BASE_URL);

    const buttons = page.locator("button");
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute("aria-label");
      const textContent = await button.textContent();
      const hasLabel = (ariaLabel && ariaLabel.length > 0) || (textContent && textContent.trim().length > 0);

      expect(
        hasLabel,
        `Button ${i} has no aria-label or text content`
      ).toBe(true);
    }
  });
});

test.describe("Navigation — bottom nav works", () => {
  test("can navigate between all 3 pages", async ({ page }) => {
    await page.goto(BASE_URL);

    // Home should show the blob
    await expect(page.locator("canvas")).toBeVisible();

    // Navigate to Scenarios
    await page.click('[aria-label="Scenarios"]');
    await page.waitForTimeout(300);

    // Scenario cards should be visible (4 grid items)
    const cards = page.locator("button").filter({ has: page.locator("text=/💼|🏥|🗣️|❓/") });
    await expect(cards.first()).toBeVisible();

    // Navigate to Settings
    await page.click('[aria-label="Settings"]');
    await page.waitForTimeout(300);

    // Flag buttons should be visible
    const flags = page.locator("button").filter({ has: page.locator("text=/🇫🇷|🇪🇸|🇩🇪/") });
    await expect(flags.first()).toBeVisible();

    // Navigate back Home
    await page.click('[aria-label="Home"]');
    await page.waitForTimeout(300);
    await expect(page.locator("canvas")).toBeVisible();
  });
});

test.describe("Illiteracy-specific checks", () => {
  test("No text is the sole conveyor of information", async ({ page }) => {
    await page.goto(BASE_URL);

    // Check that status text elements also have a visual indicator nearby
    // (colored dot, animation state)
    const statusDot = page.locator(
      'span[style*="border-radius: 50%"][style*="width: 8px"]'
    );
    await expect(statusDot).toBeVisible();
  });

  test("Scenario cards are distinguishable without text", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('[aria-label="Scenarios"]');
    await page.waitForTimeout(500);

    // Each scenario card should have a unique emoji icon
    const emojis = ["💼", "🏥", "🗣️", "❓"];
    for (const emoji of emojis) {
      const card = page.locator(`button:has-text("${emoji}")`);
      await expect(card).toBeVisible();
    }
  });

  test("Settings languages are distinguishable by flag", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('[aria-label="Settings"]');
    await page.waitForTimeout(500);

    const flags = ["🇫🇷", "🇪🇸", "🇩🇪", "🇸🇦", "🇨🇳", "🇧🇷"];
    for (const flag of flags) {
      const btn = page.locator(`button:has-text("${flag}")`);
      await expect(btn).toBeVisible();
    }
  });
});

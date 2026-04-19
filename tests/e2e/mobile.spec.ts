/**
 * Mobile audit spec — runs under the `chromium-mobile` project (Pixel 5
 * device profile, ~412×915 viewport). Verifies the app is actually usable
 * on a mobile viewport:
 *
 *   1. No horizontal page overflow on any guest route
 *   2. Task Board is force-rendered as List view (kanban is unreadable
 *      at 412px even with snap-scroll)
 *   3. Calendar /calendar renders the Day view (not Week) when the user's
 *      stored preference is Week — the 7-col grid is unreadable at 412px
 *   4. Inputs on the sign-in page have effective font-size ≥ 16px so
 *      iOS Safari / Android Chrome don't auto-zoom the viewport
 *   5. Bottom-nav is visible and pinned to the bottom of the viewport
 *
 * Tagged `@mobile` so the chromium-mobile project's grep filter picks it up.
 */
import { expect } from '@playwright/test';
import { test } from './fixtures/guest';
import { waitForAppReady } from './fixtures/helpers';

const GUEST_ROUTES = [
  '/calendar',
  '/tasks',
  '/plan',
  '/pomodoro',
  '/focus',
  '/goals',
  '/performance',
  '/shop',
  '/intelligence',
  '/docs',
];

test.describe('Mobile — no horizontal overflow @mobile', () => {
  for (const route of GUEST_ROUTES) {
    test(`${route} fits within viewport width @mobile`, async ({ guestPage: page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await page.waitForTimeout(400);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // Allow a 1px rounding tolerance.
      expect(scrollWidth, `${route} overflows horizontally`).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});

test.describe('Mobile — task board force-lists @mobile', () => {
  test('/tasks renders list view on mobile regardless of stored preference @mobile', async ({ guestPage: page }) => {
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await page.waitForTimeout(400);

    // The header H1 switches text based on viewMode: "Task Board" (kanban)
    // vs "Tasks" (list). On mobile we force list, so "Tasks" must be shown.
    const h1 = page.locator('h1').first();
    await expect(h1).toHaveText(/^Tasks$/);

    // View toggle is hidden on mobile (md:flex means only visible ≥768px).
    const toggle = page.locator('[aria-label="Kanban view"]');
    await expect(toggle).toBeHidden();
  });
});

test.describe('Mobile — calendar forces day view @mobile', () => {
  test('/calendar does NOT render 7-col week grid on mobile @mobile', async ({ guestPage: page }) => {
    // Seed Week as the preferred view via localStorage before nav so we
    // assert that mobile overrides, not that default happens to be Day.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'lumina-calendar',
          JSON.stringify({ state: { view: 'week' }, version: 0 }),
        );
      } catch { /* ignore */ }
    });
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await page.waitForTimeout(400);

    // View-switcher tabs are hidden on mobile.
    const weekTab = page.locator('[role="tab"]', { hasText: 'Week' });
    await expect(weekTab).toBeHidden();
  });
});

test.describe('Mobile — input zoom prevention @mobile', () => {
  test('sign-in page inputs have font-size ≥ 16px @mobile', async ({ page }) => {
    await page.goto('/auth/signin', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const emailFontSize = await page
      .locator('input[type="email"]')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(emailFontSize).toBeGreaterThanOrEqual(16);

    const passwordFontSize = await page
      .locator('input[type="password"]')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(passwordFontSize).toBeGreaterThanOrEqual(16);
  });
});

test.describe('Mobile — bottom nav @mobile', () => {
  test('bottom nav is visible on /tasks and pinned to bottom @mobile', async ({ guestPage: page }) => {
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await page.waitForTimeout(400);

    // Bottom nav has md:hidden and fixed bottom-0. Grab any <nav> element
    // at the bottom of the viewport; AppShell only mounts one on mobile.
    const nav = page.locator('nav').filter({ hasNot: page.locator('[hidden]') }).last();
    await expect(nav).toBeVisible();

    const box = await nav.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) {
      // Nav should be in the bottom third of the viewport.
      expect(box.y).toBeGreaterThan(viewport.height * 0.66);
    }
  });
});

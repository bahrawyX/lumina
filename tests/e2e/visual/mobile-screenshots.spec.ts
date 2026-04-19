/**
 * Mobile-viewport full-page screenshots for the whole app.
 *
 * Runs under the `chromium-mobile` project (Pixel 5 device profile).
 * Output directory is controlled by env var MOBILE_SNAPSHOT_DIR so a
 * before/after pair can be captured without duplicating this spec:
 *
 *   MOBILE_SNAPSHOT_DIR=mobile      npx playwright test --project=chromium-mobile mobile-screenshots
 *   MOBILE_SNAPSHOT_DIR=mobile-after npx playwright test --project=chromium-mobile mobile-screenshots
 *
 * Default subdirectory: `mobile`.
 *
 * Tagged `@mobile` so the chromium-mobile project's grep filter picks it up.
 */
import { test } from '../fixtures/guest';
import { waitForAppReady } from '../fixtures/helpers';
import path from 'path';
import fs from 'fs';

const SUBDIR = process.env.MOBILE_SNAPSHOT_DIR ?? 'mobile';
const OUT_DIR = path.resolve(process.cwd(), 'playwright-screenshots', SUBDIR);

const GUEST_ROUTES = [
  '/calendar',
  '/tasks',
  '/plan',
  '/pomodoro',
  '/focus',
  '/focus/done',
  '/goals',
  '/performance',
  '/shop',
  '/intelligence',
  '/docs',
];

const PUBLIC_ROUTES = ['/', '/auth/signin', '/onboarding'];

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.describe('Mobile visual — authenticated app routes @mobile', () => {
  for (const route of GUEST_ROUTES) {
    test(`mobile screenshot ${route} @mobile`, async ({ guestPage: page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await page.waitForTimeout(800);
      const fileName = route === '/' ? 'root' : route.replace(/^\//, '').replace(/\//g, '__');
      await page.screenshot({
        path: path.join(OUT_DIR, `${fileName || 'root'}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});

test.describe('Mobile visual — public routes @mobile', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`mobile screenshot ${route === '/' ? 'landing' : route} @mobile`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(800);
      const fileName = route === '/' ? 'landing' : route.replace(/^\//, '').replace(/\//g, '__');
      await page.screenshot({
        path: path.join(OUT_DIR, `public__${fileName}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});

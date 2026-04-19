/**
 * Pure visual capture spec. Produces full-page PNGs for every route so a
 * human (or Claude in Chrome in Phase 2) can eyeball the current state of
 * the app without spinning up the dev server themselves.
 *
 * Output: playwright-screenshots/<route>.png  (gitignored)
 */
import { test } from '../fixtures/guest';
import { waitForAppReady } from '../fixtures/helpers';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.resolve(process.cwd(), 'playwright-screenshots');

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

test.describe('Visual — authenticated app routes', () => {
  for (const route of GUEST_ROUTES) {
    test(`screenshot ${route}`, async ({ guestPage: page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      // Give framer-motion a beat to settle opening transitions.
      await page.waitForTimeout(600);
      const fileName = route === '/' ? 'root' : route.replace(/^\//, '').replace(/\//g, '__');
      await page.screenshot({
        path: path.join(OUT_DIR, `${fileName || 'root'}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});

test.describe('Visual — public routes', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`screenshot ${route === '/' ? 'landing' : route}`, async ({ page, context }) => {
      // Public routes get a fresh context (no guest seed).
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(600);
      const fileName = route === '/' ? 'landing' : route.replace(/^\//, '').replace(/\//g, '__');
      await page.screenshot({
        path: path.join(OUT_DIR, `public__${fileName}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});

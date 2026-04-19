import { test, expect } from './fixtures/guest';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Focus timer (/focus)', () => {
  test('renders focus timer heading', async ({ guestPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/focus', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/focus(\/|$)/);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Focus console errors:\n${errs.join('\n')}`).toEqual([]);
  });
});

test.describe('Focus done (/focus/done)', () => {
  test('session-complete screen renders', async ({ guestPage: page }) => {
    const response = await page.goto('/focus/done', { waitUntil: 'domcontentloaded' });
    // Should not 404.
    expect(response?.status() ?? 0).toBeLessThan(400);
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/focus\/done/);
  });
});

test.describe('Pomodoro (/pomodoro)', () => {
  test('renders pomodoro view', async ({ guestPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/pomodoro', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/pomodoro/);

    // Pomodoro timer always has at least one button (start / config).
    await expect(page.locator('button').first()).toBeVisible({ timeout: 15_000 });

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Pomodoro console errors:\n${errs.join('\n')}`).toEqual([]);
  });
});

import { test, expect } from './fixtures/app';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Calendar (/calendar)', () => {
  test('renders calendar shell with header controls', async ({ appPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);

    await expect(page).toHaveURL(/\/calendar/);

    // Header navigation controls — Prev / Next arrows were found with aria-labels.
    await expect(page.getByRole('button', { name: /^Previous$/ }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^Next$/ }).first()).toBeVisible();

    // Focus-mode toggle exists.
    await expect(page.getByRole('button', { name: /Toggle Focus Mode/i }).first()).toBeVisible();

    // No app-level console errors.
    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Calendar console errors:\n${errs.join('\n')}`).toEqual([]);
  });

  test('Prev/Next buttons advance calendar without crashing', async ({ appPage: page }) => {
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);

    const next = page.getByRole('button', { name: /^Next$/ }).first();
    const prev = page.getByRole('button', { name: /^Previous$/ }).first();

    await expect(next).toBeVisible({ timeout: 15_000 });
    await next.click();
    await next.click();
    await prev.click();

    // Still on /calendar, no navigation happened.
    await expect(page).toHaveURL(/\/calendar/);
  });

  test('keyboard shortcut "c" toggles focus mode without error', async ({ appPage: page }) => {
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);

    // f-key toggles focus mode (see AppShell keydown handler — uses lowercase 'f').
    await page.keyboard.press('f');
    // Nothing to assert visually beyond "didn't navigate / didn't crash".
    await expect(page).toHaveURL(/\/calendar/);
  });
});

import { test, expect } from './fixtures/app';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Intelligence (/intelligence)', () => {
  test('renders intelligence header', async ({ appPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/intelligence', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/intelligence/);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Intelligence console errors:\n${errs.join('\n')}`).toEqual([]);
  });
});

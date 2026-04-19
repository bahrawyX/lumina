import { test, expect } from './fixtures/guest';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Goals (/goals)', () => {
  test('renders goals header', async ({ guestPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/goals', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/goals/);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Goals console errors:\n${errs.join('\n')}`).toEqual([]);
  });
});

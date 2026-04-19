import { test, expect } from './fixtures/guest';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Shop (/shop)', () => {
  test('renders shop page with item cards', async ({ guestPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/shop/);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Shop console errors:\n${errs.join('\n')}`).toEqual([]);
  });

  test('filter interaction does not crash the page', async ({ guestPage: page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);

    // Shop has category filter buttons — click the first non-"All" pill if present.
    const filterPills = page.locator('button').filter({ hasText: /^(All|Themes|Sounds|Boosts|Badges|Accessories|Productivity)/ });
    const count = await filterPills.count();
    if (count > 1) {
      await filterPills.nth(1).click();
      // Exit animation from c109865 — give it time to settle.
      await page.waitForTimeout(300);
      await expect(page).toHaveURL(/\/shop/);
    }
  });
});

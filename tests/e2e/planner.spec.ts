import { test, expect } from './fixtures/guest';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Daily Plan (/plan)', () => {
  test('renders daily plan view', async ({ guestPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/plan', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/plan/);

    // DailyPlanPage renders DailyPlanView + IntelligencePanel.
    // Assert at least one heading/visible region exists.
    const h1OrH2 = page.locator('h1, h2, [role="heading"]').first();
    await expect(h1OrH2).toBeVisible({ timeout: 15_000 });

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Plan console errors:\n${errs.join('\n')}`).toEqual([]);
  });
});

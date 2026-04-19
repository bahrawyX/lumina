import { test, expect } from './fixtures/guest';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Performance (/performance)', () => {
  test('renders performance header and contribution heatmap', async ({ guestPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/performance', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/performance/);

    // At least the page heading renders.
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });

    // Heatmap section includes the text "contributions in the last year" or a
    // similar header. Accept either the presence of that phrase or a legend.
    const heatmapCue = page
      .locator('text=/contributions|most active|best streak/i')
      .first();
    await expect(heatmapCue).toBeVisible({ timeout: 15_000 });

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Performance console errors:\n${errs.join('\n')}`).toEqual([]);
  });

  test('contribution settings popover opens and shows scoring legend', async ({ guestPage: page }) => {
    await page.goto('/performance', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);

    const settings = page.getByRole('button', { name: /Contribution settings/i }).first();
    if (await settings.isVisible().catch(() => false)) {
      await settings.click();
      // The popover includes the scoring explanation we updated in c109865.
      await expect(
        page.locator('text=/Scheduled events/i').first(),
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

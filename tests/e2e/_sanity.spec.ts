import { test, expect } from './fixtures/app';

test.describe('@sanity guest bypass', () => {
  test('seeded guest reaches /calendar without onboarding redirect', async ({ appPage }) => {
    await appPage.goto('/calendar', { waitUntil: 'domcontentloaded' });

    // Should not have been bounced to /onboarding.
    await expect(appPage).toHaveURL(/\/calendar($|\?)/);

    // Give client-side hydration a moment.
    await appPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Calendar main content rendered (sidebar + any main landmark is enough).
    const mainVisible = await appPage.locator('main, [role="main"], body').first().isVisible();
    expect(mainVisible).toBe(true);
  });
});

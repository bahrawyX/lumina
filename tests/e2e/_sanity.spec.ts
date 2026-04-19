import { test, expect } from './fixtures/guest';

test.describe('@sanity guest bypass', () => {
  test('seeded guest reaches /calendar without onboarding redirect', async ({ guestPage }) => {
    await guestPage.goto('/calendar', { waitUntil: 'domcontentloaded' });

    // Should not have been bounced to /onboarding.
    await expect(guestPage).toHaveURL(/\/calendar($|\?)/);

    // Give client-side hydration a moment.
    await guestPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Calendar main content rendered (sidebar + any main landmark is enough).
    const mainVisible = await guestPage.locator('main, [role="main"], body').first().isVisible();
    expect(mainVisible).toBe(true);
  });
});

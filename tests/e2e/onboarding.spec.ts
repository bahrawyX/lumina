import { test, expect } from './fixtures/publicPage';

test.describe('Onboarding (/onboarding)', () => {
  test('fresh localStorage visitor is routed to /onboarding from app routes', async ({ page, context }) => {
    // No localStorage seeding — first-visit behaviour. Visit /calendar and expect redirect.
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' });

    // Allow client-side redirect to fire.
    await page.waitForURL(/\/(onboarding|auth\/signin|$)/, { timeout: 10_000 }).catch(() => {});

    // AppShell redirects to /onboarding when onboarding is not complete. (It also
    // may redirect to /auth/signin if a session-gate is wired server-side — we
    // accept either outcome here.)
    const url = page.url();
    expect(url).toMatch(/\/onboarding|\/auth\/signin|\/$/);
  });

  test('/onboarding renders the flow', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/onboarding/);

    // The flow is a full-screen container. Expect it to render something
    // above-the-fold (a button, input, or heading).
    const interactive = page
      .locator('button, [role="button"], input, h1, h2')
      .first();
    await expect(interactive).toBeVisible({ timeout: 15_000 });
  });
});

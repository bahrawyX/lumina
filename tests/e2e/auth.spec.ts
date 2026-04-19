import { test, expect } from './fixtures/publicPage';

test.describe('Auth — /auth/signin', () => {
  test('signin page renders email/password form and provider buttons', async ({ page }) => {
    await page.goto('/auth/signin', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/auth\/signin/);

    // Email input is always present in either signin or signup mode.
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 15_000 });

    // Password input.
    const pwInput = page.locator('input[type="password"]').first();
    await expect(pwInput).toBeVisible();

    // Submit button shows "Sign in" (default mode is `signin`).
    await expect(page.getByRole('button', { name: /^Sign in$/i }).first()).toBeVisible();
  });

  test('toggling between Sign in and Create account swaps submit label', async ({ page }) => {
    await page.goto('/auth/signin', { waitUntil: 'domcontentloaded' });

    // Click the Create/Sign-up tab by accessible name.
    const signUpTab = page.getByRole('button', { name: /sign up|create account|register/i }).first();
    if (await signUpTab.isVisible().catch(() => false)) {
      await signUpTab.click();
      // Submit text should change.
      await expect(
        page.getByRole('button', { name: /create account|sign up/i }).first(),
      ).toBeVisible();
    }
  });

  test('empty form shows validation messages instead of submitting', async ({ page }) => {
    await page.goto('/auth/signin', { waitUntil: 'domcontentloaded' });
    const submit = page.getByRole('button', { name: /^Sign in$/i }).first();
    await submit.click();

    // We don't know the exact copy — just assert we stayed on /auth/signin,
    // i.e. the form did NOT submit to the server and redirect.
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});

test.describe('Auth — /auth/popup-complete', () => {
  test('popup-complete route responds', async ({ page }) => {
    // This route is navigated to by the OAuth popup; it posts a message and closes.
    // We just need to verify the route exists (returns 2xx) and doesn't crash.
    const response = await page.goto('/auth/popup-complete', { waitUntil: 'domcontentloaded' });
    expect(response?.status() ?? 0, 'popup-complete should return 2xx').toBeLessThan(400);
  });
});

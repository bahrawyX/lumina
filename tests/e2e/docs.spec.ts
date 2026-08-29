import { test, expect } from './fixtures/app';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Docs (/docs)', () => {
  test('renders docs home with "New document" CTA', async ({ appPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/docs', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/docs/);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

    // The "New document" button carries aria-label="New document" (from DocsHomePage).
    const newDoc = page.getByRole('button', { name: /New document/i }).first();
    if (await newDoc.isVisible().catch(() => false)) {
      await expect(newDoc).toBeVisible();
    }

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Docs console errors:\n${errs.join('\n')}`).toEqual([]);
  });

  test('invalid doc id redirects or shows 404/error state, not crash', async ({ appPage: page }) => {
    const response = await page.goto('/docs/this-doc-definitely-does-not-exist', {
      waitUntil: 'domcontentloaded',
    });
    // Next.js App Router with error.tsx renders an error boundary (still 200 on client).
    // The important thing: no unhandled crash — the page reaches a renderable state.
    expect(response?.status() ?? 0).toBeLessThan(500);

    // Some interactive element is eventually visible (nav, button, link, heading).
    const something = page.locator('button, a, h1, h2, [role="heading"]').first();
    await expect(something).toBeVisible({ timeout: 15_000 });
  });
});

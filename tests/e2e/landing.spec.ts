import { test, expect } from './fixtures/publicPage';
import { collectConsole } from './fixtures/helpers';

test.describe('Landing page (/)', () => {
  test('renders marketing hero and nav', async ({ page }) => {
    const con = collectConsole(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Not bounced to /calendar (no session).
    await expect(page).toHaveURL(/\/$|\/\?/);

    // Marketing page renders a <main> landmark.
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });

    // Title from metadata.
    await expect(page).toHaveTitle(/Lumina/i);

    // At least one CTA link pointing to signin exists.
    const signinLinks = page.locator('a[href*="/auth/signin"]');
    await expect(signinLinks.first()).toBeVisible({ timeout: 15_000 });

    // No app-level console errors.
    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Console errors on /: ${errs.join('\n')}`).toEqual([]);
  });

  test('signin CTA navigates to /auth/signin', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('a[href*="/auth/signin"]').first().click();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('has robots and sitemap routes', async ({ request, baseURL }) => {
    const robots = await request.get(`${baseURL}/robots.txt`);
    expect(robots.status(), 'robots.txt should exist').toBeLessThan(400);

    const sitemap = await request.get(`${baseURL}/sitemap.xml`);
    expect(sitemap.status(), 'sitemap.xml should exist').toBeLessThan(400);
  });

  test('security headers are present', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/`);
    const headers = res.headers();
    // These were added in the v26 security audit (next.config.mjs).
    expect(headers['x-frame-options']?.toLowerCase() ?? '').toMatch(/sameorigin|deny/);
    expect(headers['referrer-policy']).toBeTruthy();
    // CSP may be Report-Only depending on environment; either counts.
    const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
    expect(csp, 'CSP header (enforced or report-only)').toBeTruthy();
  });
});

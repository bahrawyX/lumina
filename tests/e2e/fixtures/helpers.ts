import type { Page, ConsoleMessage } from '@playwright/test';

/**
 * Attach a console collector to a page. Returns a getter that reveals any
 * errors or warnings seen since attach time. Useful for asserting that a
 * page didn't log a React error or a Next.js hydration mismatch.
 */
export function collectConsole(page: Page) {
  const errors: ConsoleMessage[] = [];
  const warnings: ConsoleMessage[] = [];
  const pageErrors: Error[] = [];

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error') errors.push(msg);
    else if (t === 'warning') warnings.push(msg);
  });
  page.on('pageerror', (err) => pageErrors.push(err));

  return {
    errors: () => errors,
    warnings: () => warnings,
    pageErrors: () => pageErrors,
    /**
     * Returns error-level console messages that are clearly app bugs
     * (not 3rd-party noise like favicon 404s or expected OAuth-not-configured
     * errors from BetterAuth during guest tests).
     */
    appErrors: () => {
      const IGNORE = [
        /favicon/i,
        /\/api\/auth\/(get-session|session)/,
        /better-auth/i,
        /service-worker/i,
        /manifest\.webmanifest/i,
        /web-push/i,
        /net::ERR_ABORTED/,
        /downloadable fonts?/i,
        /\[DEP0\d+\]/, // node deprecation warnings
        // In guest mode the app's DB-backed API routes return 401/403 — expected.
        /Failed to load resource.*(401|403|404)/i,
        /status of (401|403|404)/i,
        // Next.js dev-mode HMR noise.
        /\[Fast Refresh\]/,
        /\[HMR\]/,
        // Hydration-warning noise that's benign in dev.
        /Extra attributes from the server/i,
      ];
      return [...errors, ...pageErrors.map((e) => ({ text: () => e.message, type: () => 'error' } as unknown as ConsoleMessage))]
        .filter((m) => !IGNORE.some((re) => re.test(m.text())));
    },
  };
}

/**
 * Wait until the app has finished client-side hydration. We look for the
 * onboarding/hydration overlay (if any) to go away, and for the body to
 * not be the Lumina-logo bootstrapping state.
 */
export async function waitForAppReady(page: Page, timeout = 15_000) {
  // Hydration overlay in AppShell uses z-[9999] fixed inset-0; wait for it to unmount.
  await page
    .waitForFunction(
      () => {
        const overlays = document.querySelectorAll('[class*="z-[9999"]');
        // overlay may mount then unmount; if none present, we're ready
        return overlays.length === 0;
      },
      { timeout },
    )
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
}

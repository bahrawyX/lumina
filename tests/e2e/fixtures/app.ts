/**
 * A page inside the authenticated app.
 *
 * This replaces the old `guestPage` fixture, whose premise stopped being true:
 * it wrote `lumina-guest.state.isGuest = true` into localStorage on the basis
 * that "the AppShell doesn't hard-gate routes server-side". Route protection
 * now happens in `proxy.ts`, before render, against the session cookie — so a
 * guest is redirected to `/auth/signin` and every spec using it failed on its
 * first assertion. CI never ran them, so nobody found out.
 *
 * The session itself is established once in `global-setup.ts` and supplied to
 * every test through Playwright's `storageState`. This fixture only re-asserts
 * the client-side entries, because `storageState` restores localStorage per
 * origin and a spec that navigates to a different one would otherwise lose it.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { APP_LOCAL_STORAGE } from '../global-setup';

export type AppFixtures = {
  appPage: Page;
};

/**
 * Client state every spec depends on: onboarding satisfied locally so the gate
 * passes on the first frame, tutorial suppressed so its overlay is not sitting
 * on top of the thing under test, install prompt snoozed so it does not cover
 * the bottom-right corner.
 *
 * Re-exported rather than redefined, so there is one copy and the `version`
 * fields cannot drift out of step with the stores' `migrate` functions.
 */
export { APP_LOCAL_STORAGE };

export async function seedAppState(context: BrowserContext): Promise<void> {
  await context.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [key, value] of Object.entries(entries)) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      /* storage unavailable (sandboxed page) — the specs still run */
    }
  }, APP_LOCAL_STORAGE);
}

export const test = base.extend<AppFixtures>({
  appPage: async ({ context, page }, use) => {
    await seedAppState(context);
    await use(page);
  },
});

export { expect };

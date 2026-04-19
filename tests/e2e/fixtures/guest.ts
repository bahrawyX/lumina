/**
 * Guest-mode fixture.
 *
 * The Lumina AppShell doesn't hard-gate routes server-side — it only redirects
 * to /onboarding when `lumina-onboarding.state.completed` is false. Setting
 * `lumina-guest.state.isGuest = true` disables the real-user-only affordances.
 *
 * Using addInitScript means the storage is in place *before* any app code runs,
 * so the very first render sees a completed-onboarding guest user.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

export type GuestFixtures = {
  guestPage: Page;
};

// Zustand persist stores wrap their real state in { state, version }.
// Keep the minimum fields the stores assert on in one place so a schema change
// is a single-line fix.
export const GUEST_LOCAL_STORAGE = {
  'lumina-guest': JSON.stringify({
    state: { isGuest: true, bannerDismissed: true },
    version: 0,
  }),
  'lumina-onboarding': JSON.stringify({
    state: {
      completed: true,
      step: 6,
      userName: 'E2E Tester',
      userRole: 'QA',
      workStart: '09:00',
      workEnd: '17:00',
      timezone: 'America/Los_Angeles',
      focusPreference: 'morning',
      focusSessionLength: '50/10',
      customFocusMinutes: 60,
      customBreakMinutes: 15,
      googleConnected: false,
      microsoftConnected: false,
      focusGoals: ['deep-work'],
    },
    version: 0,
  }),
  // Silence tutorial overlay + prompt so neither covers elements during tests.
  // Must match useTutorialStore's `partialize` shape exactly:
  //   { hasCompletedTutorial, hasSeenPrompt }
  // The TourPrompt component renders when hasSeenPrompt is false, so we force
  // both flags to true to suppress the overlay *and* the dismissible prompt.
  'lumina-tutorial': JSON.stringify({
    state: { hasCompletedTutorial: true, hasSeenPrompt: true },
    version: 0,
  }),
};

/** Install the pre-seeded localStorage into a fresh context. */
export async function seedGuest(context: BrowserContext): Promise<void> {
  await context.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [key, value] of Object.entries(entries)) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      /* storage unavailable (sandboxed page) — skip */
    }
  }, GUEST_LOCAL_STORAGE);
}

export const test = base.extend<GuestFixtures>({
  guestPage: async ({ context, page }, use) => {
    await seedGuest(context);
    // Re-navigate so init script fires after seeding. Playwright runs
    // addInitScript on every new document, so the first goto already picks it up.
    await use(page);
  },
});

export { expect };

import { chromium, request, type FullConfig } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Sign a test account in once, and hand every spec the resulting session.
 *
 * ## Why this replaces the old guest fixture
 *
 * The suite used to fake its way past the app by writing
 * `lumina-guest.state.isGuest = true` into localStorage, on the stated premise
 * that "the AppShell doesn't hard-gate routes server-side". That was true when
 * it was written and is not any more: route protection now happens in
 * `proxy.ts`, before a page renders, keyed on the session cookie. A guest has
 * no cookie, so every `(app)` route answered 307 to `/auth/signin` and all
 * twelve specs that relied on it failed at their first assertion.
 *
 * Nobody noticed because CI never ran them.
 *
 * Faking a cookie would only move the problem: the layout resolves the session
 * server-side, so a forged cookie yields no user and the onboarding gate
 * redirects anyway. The honest fix is a real account and a real sign-in —
 * which also means the specs now exercise the same path a person does.
 *
 * ## Onboarding
 *
 * `onboarding_completed_at` is an account-level column, and the redirect gate
 * reads it on the server. Setting localStorage cannot satisfy it, so the setup
 * marks the account onboarded through the app's own preferences endpoint.
 */

const EMAIL = process.env.E2E_USER_EMAIL ?? 'e2e@lumina.test';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'E2ePassword123!';
const NAME = 'E2E Tester';

export const STORAGE_STATE = 'tests/e2e/.auth/user.json';

/**
 * Client-side state every spec wants: onboarding marked done locally so the
 * gate is satisfied on the first frame, and the tutorial suppressed so its
 * overlay does not sit on top of the elements under test.
 *
 * The `version` fields matter. These stores declare `version: 1` with a
 * `migrate` that discards anything older, so a payload seeded at `version: 0`
 * — as the old fixture did — is thrown away on read and the tutorial reappears
 * mid-test.
 */
export const APP_LOCAL_STORAGE: Record<string, string> = {
  'lumina-onboarding': JSON.stringify({
    version: 1,
    state: {
      completed: true,
      step: 6,
      userName: NAME,
      userRole: 'QA',
      workStart: '09:00',
      workEnd: '17:00',
      timezone: 'America/Los_Angeles',
      focusPreference: 'morning',
      focusSessionLength: '50/10',
      focusGoals: ['deep-work'],
    },
  }),
  'lumina-tutorial': JSON.stringify({
    version: 1,
    state: { hasCompletedTutorial: true, hasSeenPrompt: true },
  }),
  // Suppresses the PWA install card, which is `fixed` in the bottom-right and
  // otherwise overlaps whatever a spec is trying to click there.
  'lumina-pwa-snoozed': String(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  // `Origin` on every request. The app's CSRF middleware rejects a
  // state-changing request without one — and the first version of this setup
  // swallowed that 403 behind a `.catch()`, so the account was never marked
  // onboarded and twelve specs were redirected to /onboarding by a gate doing
  // exactly its job. Failing loudly below is the other half of that lesson.
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });

  // Idempotent: a re-run against a database that already has the account gets a
  // duplicate error here, which is fine — the sign-in below is what matters.
  await api
    .post('/api/auth/sign-up/email', {
      data: { email: EMAIL, password: PASSWORD, name: NAME },
      failOnStatusCode: false,
    })
    .catch(() => undefined);

  const signIn = await api.post('/api/auth/sign-in/email', {
    data: { email: EMAIL, password: PASSWORD },
    failOnStatusCode: false,
  });

  if (!signIn.ok()) {
    throw new Error(
      `E2E setup could not sign in as ${EMAIL} (HTTP ${signIn.status()}). ` +
        `Check that the app is reachable at ${baseURL} and its database is migrated.`,
    );
  }

  /**
   * Mark the ACCOUNT onboarded, not just the browser.
   *
   * Seeding `lumina-onboarding` in localStorage is not enough on its own:
   * `PersistenceBootstrap` hydrates from `/api/users/preferences` shortly after
   * mount and the server value wins (F8.1), so a local `true` is corrected back
   * to `false` a moment later and the gate redirects mid-test. That produces a
   * flaky suite whose failures look like timing.
   */
  const prefs = await api.patch('/api/users/preferences', {
    data: { onboardingCompleted: true, timezone: 'America/Los_Angeles' },
    failOnStatusCode: false,
  });

  if (!prefs.ok()) {
    throw new Error(
      `E2E setup could not mark the account onboarded (HTTP ${prefs.status()}: ` +
        `${await prefs.text()}). Every app spec would redirect to /onboarding.`,
    );
  }

  const state = await api.storageState();
  await api.dispose();

  // Playwright's `storageState` from an API context carries cookies but no
  // origin-scoped localStorage, so the browser-side entries are attached here.
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  await page.goto(`${baseURL}/auth/signin`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((entries: Record<string, string>) => {
    for (const [key, value] of Object.entries(entries)) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private mode — the specs still run, just noisier */
      }
    }
  }, APP_LOCAL_STORAGE);

  await mkdir(dirname(STORAGE_STATE), { recursive: true });
  await context.storageState({ path: STORAGE_STATE });
  await browser.close();

  // Written for the human reading a CI log, not for the suite.
  await writeFile(
    'tests/e2e/.auth/README.txt',
    'Generated by global-setup.ts. Contains a session for a disposable test account.\n',
    'utf8',
  );
}

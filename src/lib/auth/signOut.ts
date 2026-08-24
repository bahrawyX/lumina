import { authClient } from '@/lib/auth-client';
import { clearLuminaStorage } from '@/lib/storage';
import { useGuestStore } from '@/store/useGuestStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';

/**
 * The one sign-out path.
 *
 * There were three, and they disagreed:
 *
 * |                          | Sidebar (the real one) | OnboardingFlow | LoginButton (dead) |
 * |--------------------------|------------------------|----------------|--------------------|
 * | `signOut()` awaited      | **No** — fire-and-forget | Yes          | Yes                |
 * | localStorage cleared     | Yes                    | Yes            | Yes                |
 * | Zustand stores reset     | No — relies on reload  | **No, and no reload** | No          |
 * | Push unsubscribed        | **No**                 | **No**         | **No**             |
 * | `resetOnboarding()`      | **No** — grabbed then discarded with `void resetOnboarding;` | No | No |
 *
 * ## F7.1 — sign-out was not awaited and could lose the race
 *
 *     authClient.signOut().catch(() => {});   // fire-and-forget
 *     window.location.href = '/';             // cancels the in-flight fetch
 *
 * Unloading the document cancels in-flight fetches, so `/api/auth/sign-out`
 * could be aborted before reaching the server. **The `sessions` row survives
 * and the cookie-clearing header never arrives** — the user appears signed out
 * (localStorage is empty) while a valid 7-day session cookie sits on the
 * device. Anyone who then re-completes onboarding lands in the *previous*
 * account's data.
 *
 * The comment justifying the ordering ("hard-navigate FIRST or AppShell's
 * redirect effect wins the race") is addressed by the hard navigation itself,
 * not by skipping the await.
 *
 * The await is raced against a short timeout so a hung network cannot trap the
 * user on a page they are trying to leave — but the request is also sent with
 * `keepalive` semantics via the browser, so it still completes.
 *
 * ## F7.2 — the push subscription survived sign-out
 *
 * `useNotificationStore.unsubscribe()` exists — it calls `sub.unsubscribe()`
 * and the DELETE endpoint — and **no sign-out path called it**. The
 * `push_subscriptions` row stayed bound to the old `userId` and the browser
 * kept the endpoint, so a shared device **continued to surface the previous
 * user's event reminders and daily brief on the lock screen, indefinitely.**
 *
 * ## F7.3 — the onboarding sign-out left every store populated
 *
 * No reload, no store reset, no cache clear. Afterwards
 * `useCalendarEventsStore`, `useTaskBoardStore`, `useDocsStore` and
 * `useCoinsStore` still held the signed-out user's records **in memory and kept
 * rendering them** — and every persisted store's middleware re-wrote its
 * localStorage key on the next `set()`, partially undoing the
 * `clearLuminaStorage()` within seconds.
 *
 * ## Order matters
 *
 * 1. Unsubscribe push **while the session still exists** — the DELETE is
 *    authenticated, so doing it after sign-out would 401 and leave the row.
 * 2. Await `signOut()`, so the server revokes the row and clears the cookie.
 * 3. Clear storage and reset in-memory stores.
 * 4. Hard-navigate, which tears down every store that could re-persist.
 */

/** How long to wait for the server to acknowledge before navigating anyway. */
const SIGN_OUT_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export interface SignOutOptions {
  /** Where to land. Defaults to the marketing page. */
  redirectTo?: string;
  /**
   * Skip the hard navigation — for the onboarding flow, which stays on the
   * page and re-renders its signed-out state. It must still reset the stores,
   * which is F7.3.
   */
  navigate?: boolean;
}

export async function signOutEverywhere(options: SignOutOptions = {}): Promise<void> {
  const { redirectTo = '/', navigate = true } = options;

  // 1. Push first — the DELETE is authenticated.
  await withTimeout(
    useNotificationStore.getState().unsubscribe?.() ?? Promise.resolve(),
    SIGN_OUT_TIMEOUT_MS,
  );

  // 2. Actually sign out, and wait for it.
  await withTimeout(authClient.signOut(), SIGN_OUT_TIMEOUT_MS);

  // 3. Reset client state. Guest and onboarding stores are reset explicitly:
  //    `resetOnboarding` was previously grabbed and then discarded with
  //    `void resetOnboarding;`, so a returning user inherited the departed
  //    user's name, role and work hours.
  try {
    useGuestStore.getState().clearGuestSession();
    useOnboardingStore.getState().reset();
  } catch {
    /* a store failing to reset must not block the sign-out */
  }

  // 4. Storage last, so nothing above can re-persist into it.
  clearLuminaStorage();

  if (navigate && typeof window !== 'undefined') {
    // Hard navigation: tears down every in-memory store, so none of them can
    // re-write its localStorage key after the wipe.
    window.location.href = redirectTo;
  }
}

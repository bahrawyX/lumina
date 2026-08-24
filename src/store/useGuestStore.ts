import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Guest mode — **only** ever entered deliberately.
 *
 * This store used to have a single `isGuest` boolean that two very different
 * situations both set to `true`:
 *
 *   1. The user clicked "I understand — continue as Guest".
 *   2. `useSession()` resolved with no user.
 *
 * Case 2 covers a session cookie expiring mid-use, a cleared cookie, a
 * third-party-cookie block, and a transient `/api/auth/get-session` failure —
 * none of which are a choice. The consequences were severe: `docsPersistence`
 * routed every create/update/delete into `localStorage['lumina-guest-docs']`
 * instead of the API, so the user kept typing into what looked like their own
 * account while the data landed only in the browser. Every other domain (tasks,
 * events, planner, goals, focus) has no guest path at all, so those writes
 * simply 401'd and vanished. And `AppShell`'s `beforeunload` guard armed itself,
 * so the user got a browser "leave site?" prompt during what they believed was
 * an ordinary session.
 *
 * The two states are now distinct and only `explicitGuest` routes writes to
 * localStorage. "The session went away" is `useSessionStore.expired`, which
 * surfaces a sign-in prompt instead of silently changing where data goes.
 */
interface GuestState {
  /**
   * True only after the user deliberately chose to continue without an account,
   * via the two-step confirm in the onboarding flow.
   */
  isGuest: boolean;
  /** Whether the in-app warning banner has been manually dismissed. */
  bannerDismissed: boolean;

  /**
   * Enter guest mode. Call this **only** from the deliberate "continue as
   * guest" path — never from a session check.
   */
  enterGuestMode: () => void;
  /**
   * Leave guest mode. Call on sign-in, sign-up and sign-out so a returning
   * authenticated user never inherits a stale guest flag.
   */
  clearGuestSession: () => void;
  dismissBanner: () => void;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set) => ({
      isGuest: false,
      bannerDismissed: false,

      enterGuestMode: () => set({ isGuest: true, bannerDismissed: false }),
      clearGuestSession: () => set({ isGuest: false, bannerDismissed: false }),
      dismissBanner: () => set({ bannerDismissed: true }),
    }),
    {
      name: 'lumina-guest',
      version: 1,
      partialize: (s) => ({
        isGuest: s.isGuest,
        bannerDismissed: s.bannerDismissed,
      }),
      // v0 set `isGuest: true` for anyone whose session had merely gone away.
      // We cannot tell those apart from deliberate guests after the fact, so
      // the safe migration is to drop the flag: a real guest re-enters the mode
      // in one click, while an expired-session user stops having their writes
      // silently diverted to localStorage.
      migrate: (persisted) => ({
        ...(persisted as Record<string, unknown>),
        isGuest: false,
        bannerDismissed: false,
      }),
    },
  ),
);

/**
 * F8.1 — onboarding completion was localStorage-only, so returning users were
 * re-onboarded.
 *
 * `grep -rn "onboard" src/db/ src/app/api/` returned nothing: `complete()` was
 * `set({ completed: true })` and the only durable trace was
 * `localStorage['lumina-onboarding']`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useOnboardingStore } from '@/store/useOnboardingStore';

const realFetch = globalThis.fetch;
let requests: Array<{ url: string; body: Record<string, unknown> }>;

beforeEach(() => {
  requests = [];
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;

  useOnboardingStore.getState().reset();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('F8.1 — complete() writes a durable server record', () => {
  it('PATCHes /api/users/preferences with onboardingCompleted', async () => {
    useOnboardingStore.getState().complete();
    await Promise.resolve();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('/api/users/preferences');
    expect(requests[0].body.onboardingCompleted).toBe(true);
  });

  it('sends the collected profile in the same request', async () => {
    const store = useOnboardingStore.getState();
    store.setUserInfo('Ada', 'Engineer');
    store.setWorkSchedule('08:30', '16:30', 'Europe/Berlin');
    useOnboardingStore.getState().complete();
    await Promise.resolve();

    // Previously the flow overwrote workStart/workEnd/timezone on EVERY re-run,
    // because it had no idea the user had already set them.
    expect(requests[0].body).toMatchObject({
      onboardingCompleted: true,
      userRole: 'Engineer',
      workStart: '08:30',
      workEnd: '16:30',
      timezone: 'Europe/Berlin',
    });
  });

  it('still marks completion locally when the request fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    useOnboardingStore.getState().complete();
    await Promise.resolve();

    // Failing the whole onboarding on a flaky request would be worse than a
    // local-only flag that the next preferences PATCH re-sends.
    expect(useOnboardingStore.getState().completed).toBe(true);
  });
});

describe('F8.1 — hydrateFromServer adopts the account-level record', () => {
  it('a device that has never seen this account learns the user is onboarded', () => {
    expect(useOnboardingStore.getState().completed).toBe(false);

    useOnboardingStore.getState().hydrateFromServer({
      onboardingCompleted: true,
      userRole: 'Designer',
      workStart: '10:00',
      workEnd: '18:00',
      timezone: 'Asia/Tokyo',
    });

    const s = useOnboardingStore.getState();
    expect(s.completed).toBe(true);
    expect(s.userRole).toBe('Designer');
    expect(s.workStart).toBe('10:00');
    expect(s.timezone).toBe('Asia/Tokyo');
  });

  it('does not clobber values the user just entered in this session', () => {
    const store = useOnboardingStore.getState();
    store.setUserInfo('Ada', 'Engineer');
    store.setWorkSchedule('07:00', '15:00', 'Europe/Lisbon');

    // A slower preferences fetch must not overwrite what is on screen.
    useOnboardingStore.getState().hydrateFromServer({
      onboardingCompleted: true,
      userRole: 'Stale Role',
      workStart: '09:00',
      workEnd: '17:00',
      timezone: 'UTC',
    });

    const s = useOnboardingStore.getState();
    expect(s.userRole).toBe('Engineer');
    expect(s.workStart).toBe('07:00');
    expect(s.timezone).toBe('Europe/Lisbon');
  });

  it('a server "false" DOES un-complete a stale local flag', () => {
    // This asserted the opposite, and the opposite was the bug. `completed`
    // persists to localStorage, so a guest who finished onboarding left
    // `true` in the browser; signing up for a fresh account then skipped the
    // flow entirely, because `||` could never let the server say "no".
    //
    // The server value is derived from `onboarding_completed_at` on the account
    // row, so `false` is a fact about this account, not a missing value.
    useOnboardingStore.getState().complete();
    useOnboardingStore.getState().hydrateFromServer({ onboardingCompleted: false });
    expect(useOnboardingStore.getState().completed).toBe(false);
  });

  it("and a guest's finished flow does not carry into the account they create", () => {
    // The end-to-end shape of F8.1's second consequence.
    useOnboardingStore.getState().complete();
    expect(useOnboardingStore.getState().completed).toBe(true);

    // Sign-up lands, prefs load for a brand-new account.
    useOnboardingStore.getState().hydrateFromServer({
      onboardingCompleted: false,
      userRole: undefined,
      workStart: undefined,
      workEnd: undefined,
      timezone: undefined,
    });

    expect(useOnboardingStore.getState().completed).toBe(false);
  });
});

describe('F5.5 — the persisted store is versioned', () => {
  const persist = (useOnboardingStore as unknown as {
    persist: {
      getOptions: () => {
        version?: number;
        migrate?: (state: unknown, version: number) => unknown;
      };
    };
  }).persist;

  it('declares a version, so a shape change is migratable', () => {
    // `grep -n "version:\|migrate:" src/store/*.ts` previously yielded exactly
    // one hit across all persisted stores. Without a version, `persist`
    // shallow-merges whatever JSON is in localStorage over current defaults
    // with zero validation — a white screen for RETURNING users only, invisible
    // in CI and in any fresh browser.
    expect(persist.getOptions().version).toBe(1);
  });

  it('repairs a v0 payload with the wrong shape instead of trusting it', () => {
    const migrated = persist.getOptions().migrate?.(
      { focusGoals: 'deep-work', timezone: 42, completed: true },
      0,
    ) as { focusGoals: unknown; timezone: unknown; completed: boolean };

    expect(Array.isArray(migrated.focusGoals)).toBe(true);
    expect(typeof migrated.timezone).toBe('string');
    expect(migrated.completed).toBe(true);
  });

  it('passes a current-version payload through untouched', () => {
    const state = { focusGoals: ['deep-work'], timezone: 'Europe/Paris', completed: true };
    const migrated = persist.getOptions().migrate?.(state, 1);
    expect(migrated).toEqual(state);
  });
});

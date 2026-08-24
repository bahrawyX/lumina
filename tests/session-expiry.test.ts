/**
 * F5.2 / F6.5 — session loss must be visible, and must never be mistaken for
 * a deliberate choice to use guest mode.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGuestStore } from '@/store/useGuestStore';
import { useSessionStore, isSessionExpired } from '@/store/useSessionStore';
import { onUnauthorized } from '@/lib/persistence/apiClient';
import * as tasksPersistence from '@/lib/persistence/tasksPersistence';

const realFetch = globalThis.fetch;

function respondWith(status: number, body: unknown = []) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  useSessionStore.setState({ expired: false, lastKnownUserId: null });
  useGuestStore.setState({ isGuest: false, bannerDismissed: false });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('F6.5 — guest mode is only ever entered deliberately', () => {
  it('exposes no API for entering guest mode from a session check', () => {
    const store = useGuestStore.getState() as Record<string, unknown>;
    // `setGuest` was the boolean setter that a session check called with
    // `true`. Its removal is the fix: there is now no way to express
    // "session unavailable" as "the user chose guest mode".
    expect(store.setGuest).toBeUndefined();
    expect(typeof store.enterGuestMode).toBe('function');
    expect(typeof store.clearGuestSession).toBe('function');
  });

  it('enterGuestMode sets the flag; clearGuestSession clears it', () => {
    useGuestStore.getState().enterGuestMode();
    expect(useGuestStore.getState().isGuest).toBe(true);
    useGuestStore.getState().clearGuestSession();
    expect(useGuestStore.getState().isGuest).toBe(false);
  });

  it('a 401 does not turn the user into a guest', async () => {
    respondWith(401);
    await tasksPersistence.fetchAllForCurrentUser();
    expect(useGuestStore.getState().isGuest).toBe(false);
  });
});

describe('F5.2 — a 401 marks the session expired', () => {
  it('the interceptor drives useSessionStore.expired', async () => {
    const off = onUnauthorized(() => useSessionStore.getState().markExpired());
    expect(isSessionExpired()).toBe(false);

    respondWith(401);
    await tasksPersistence.fetchAllForCurrentUser();

    expect(isSessionExpired()).toBe(true);
    off();
  });

  it('a successful request leaves the session active', async () => {
    const off = onUnauthorized(() => useSessionStore.getState().markExpired());
    respondWith(200, []);
    await tasksPersistence.fetchAllForCurrentUser();
    expect(isSessionExpired()).toBe(false);
    off();
  });

  it('markActive clears a previous expiry and records the user', () => {
    useSessionStore.getState().markExpired();
    expect(isSessionExpired()).toBe(true);
    useSessionStore.getState().markActive('user-123');
    expect(isSessionExpired()).toBe(false);
    expect(useSessionStore.getState().lastKnownUserId).toBe('user-123');
  });
});

describe('F6.5 — the persisted guest flag migrates off the accidental value', () => {
  it('v0 state rehydrates with isGuest false', () => {
    // v0 could not distinguish "chose guest" from "session went away", so the
    // migration drops the flag rather than preserving a value that may have
    // been set by an expired cookie.
    const persist = (useGuestStore as unknown as {
      persist: { getOptions: () => { migrate?: (s: unknown, v: number) => unknown; version?: number } };
    }).persist;
    const options = persist.getOptions();
    expect(options.version).toBe(1);
    const migrated = options.migrate?.({ isGuest: true, bannerDismissed: true }, 0) as {
      isGuest: boolean;
    };
    expect(migrated.isGuest).toBe(false);
  });
});

/**
 * Sign-out must not wait on a promise that never settles.
 *
 * `signOutEverywhere` unsubscribes push BEFORE calling `/api/auth/sign-out`,
 * and deliberately so — the DELETE is authenticated, so it has to happen while
 * the session still exists. That ordering is fine. What was not fine is what
 * the unsubscribe did first:
 *
 *     const reg = await navigator.serviceWorker.ready;
 *
 * `serviceWorker.ready` resolves only once there is an ACTIVE registration. With
 * no service worker it never settles at all — it is not slow, it is pending
 * forever. Measured in a real browser on a page with no registration, it was
 * still pending after 1500ms while `getRegistration()` returned in 0ms.
 *
 * So every sign-out from a browser without an active worker — a fresh profile,
 * dev, a hard reload before activation — sat on that promise until the 4s
 * timeout in `signOutEverywhere` gave up, and only THEN sent the actual
 * sign-out request. A flat four-second delay before anything happened, which
 * is exactly what "signing out is really slow" describes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useNotificationStore } from '@/store/useNotificationStore';

/** How long a "fast" path may take before we call it a hang. */
const HANG_THRESHOLD_MS = 250;

const originalNavigator = globalThis.navigator;

function installServiceWorker(options: {
  registration: unknown;
  /** `ready` never settles when there is no active worker. */
  readyHangs: boolean;
}) {
  const serviceWorker = {
    ready: options.readyHangs ? new Promise(() => {}) : Promise.resolve(options.registration),
    getRegistration: vi.fn(async () => options.registration),
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...originalNavigator, serviceWorker },
    configurable: true,
    writable: true,
  });
  return serviceWorker;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
});

describe('push unsubscribe with no service worker', () => {
  it('returns immediately instead of hanging until the sign-out timeout', async () => {
    const sw = installServiceWorker({ registration: undefined, readyHangs: true });

    const started = Date.now();
    await useNotificationStore.getState().unsubscribe();
    const elapsed = Date.now() - started;

    // If this ever regresses to `ready`, the await never returns and the test
    // times out rather than failing on the assertion — which is also a clear
    // signal, just a slower one.
    expect(elapsed).toBeLessThan(HANG_THRESHOLD_MS);
    expect(sw.getRegistration).toHaveBeenCalled();
    expect(useNotificationStore.getState().subscription).toBeNull();
  });

  it('does not throw when the browser has no service worker support at all', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, serviceWorker: undefined },
      configurable: true,
      writable: true,
    });
    // `'serviceWorker' in navigator` is still true here (the key exists with an
    // undefined value), so this also covers the half-supported case.
    await expect(useNotificationStore.getState().unsubscribe()).resolves.toBeUndefined();
    expect(useNotificationStore.getState().subscription).toBeNull();
  });
});

describe('push unsubscribe with a real subscription', () => {
  it('still unsubscribes and tells the server, with keepalive', async () => {
    // The fix must not skip the actual work — the whole point of unsubscribing
    // during sign-out is that a shared device stops receiving the previous
    // user's reminders.
    const unsubscribe = vi.fn(async () => true);
    const sub = { endpoint: 'https://push.example/abc', unsubscribe };
    installServiceWorker({
      registration: { pushManager: { getSubscription: async () => sub } },
      readyHangs: true,
    });

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await useNotificationStore.getState().unsubscribe();

    expect(unsubscribe).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/push/subscribe');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: sub.endpoint });
    // Sign-out hard-navigates right afterwards, which cancels in-flight
    // requests. Without keepalive the row can survive the sign-out.
    expect(init.keepalive).toBe(true);
  });
});

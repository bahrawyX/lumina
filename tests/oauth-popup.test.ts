/**
 * F4.1 – F4.8 — the OAuth popup.
 *
 * There were four copies of this promise pattern. The social sign-in family
 * returned a bare boolean, so a provider error, a closed window, a timeout and
 * a genuine cancellation were indistinguishable — and every one of them was
 * reported to the user as "Google sign-in was cancelled."
 *
 * These tests drive the real hook through `renderHook`, with `window.open`
 * stubbed, so they exercise the actual listener/interval/timeout machinery.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { oauthFailureMessage, useOAuthPopup } from '@/hooks/useOAuthPopup';

interface FakePopup {
  closed: boolean;
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  location: { href: string };
}

let popup: FakePopup | null;
let openSpy: ReturnType<typeof vi.fn>;

function makePopup(): FakePopup {
  return { closed: false, focus: vi.fn(), close: vi.fn(), location: { href: 'about:blank' } };
}

function postComplete(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', { origin: window.location.origin, data: detail }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  popup = makePopup();
  openSpy = vi.fn(() => popup);
  vi.stubGlobal('open', openSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('F4.4 — the window opens before any await', () => {
  it('calls window.open synchronously, then navigates it', async () => {
    let resolveUrl!: (u: string) => void;
    const urlPromise = new Promise<string>((r) => {
      resolveUrl = r;
    });

    const { result } = renderHook(() => useOAuthPopup());

    let settled: unknown;
    act(() => {
      void result.current({ provider: 'google', resolveUrl: () => urlPromise }).then((r) => {
        settled = r;
      });
    });

    // The popup existed before the URL was known. Opening it AFTER
    // `await socialSignIn(...)` consumes the user gesture, and iOS Safari then
    // blocks it essentially every time.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0]).toBe('about:blank');
    expect(popup!.location.href).toBe('about:blank');

    await act(async () => {
      resolveUrl('https://accounts.google.com/o/oauth2/auth?x=1');
      await Promise.resolve();
    });

    expect(popup!.location.href).toContain('accounts.google.com');
    expect(settled).toBeUndefined();
  });

  it('a blocked popup is a reportable reason, not a thrown string', async () => {
    openSpy.mockReturnValue(null);
    const { result } = renderHook(() => useOAuthPopup());

    const res = await result.current({
      provider: 'google',
      resolveUrl: async () => 'https://example.test',
    });

    // "Allow popups" is not actionable on iOS. The caller needs to be able to
    // fall back to a full-page redirect, which a thrown string prevents.
    expect(res).toEqual({ kind: 'error', reason: 'popup-blocked' });
  });
});

describe('F4.1 — outcomes are distinguishable', () => {
  async function startFlow() {
    const { result } = renderHook(() => useOAuthPopup());
    let settled: unknown;
    await act(async () => {
      void result.current({
        provider: 'google',
        resolveUrl: async () => 'https://example.test',
        pollIntervalMs: 50,
        timeoutMs: 10_000,
      }).then((r) => {
        settled = r;
      });
      await Promise.resolve();
    });
    return () => settled;
  }

  it('a provider error carries the provider message', async () => {
    const get = await startFlow();
    await act(async () => {
      postComplete({
        type: 'lumina:oauth-complete',
        provider: 'google',
        success: false,
        error: 'access_denied',
      });
      await Promise.resolve();
    });
    // The boolean return discarded `data.error` entirely.
    expect(get()).toEqual({ kind: 'error', reason: 'message-error', error: 'access_denied' });
  });

  it('success is success', async () => {
    const get = await startFlow();
    await act(async () => {
      postComplete({ type: 'lumina:oauth-complete', provider: 'google', success: true });
      await Promise.resolve();
    });
    expect(get()).toEqual({ kind: 'ok' });
  });

  it('a closed window is "closed", not "cancelled by the provider"', async () => {
    const get = await startFlow();
    await act(async () => {
      popup!.closed = true;
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(get()).toEqual({ kind: 'error', reason: 'closed' });
  });

  it('a timeout is "timeout", and the popup is LEFT OPEN', async () => {
    const get = await startFlow();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(get()).toEqual({ kind: 'error', reason: 'timeout' });
    // F4.6: the old code force-closed the window the user was mid-2FA in.
    expect(popup!.close).not.toHaveBeenCalled();
  });
});

describe('F4.3 — a missing postMessage does not lose a successful sign-in', () => {
  it('onPoll can resolve the flow with no message at all', async () => {
    // `window.opener` is null whenever a popup blocker's "open in new tab"
    // fallback fires, or a provider round-trips through a rel=noopener
    // intermediary — the message then never arrives even though the session
    // cookie was set, and the user waited out the full timeout to be told they
    // cancelled.
    let signedIn = false;
    const { result } = renderHook(() => useOAuthPopup());
    let settled: unknown;

    await act(async () => {
      void result.current({
        provider: 'google',
        resolveUrl: async () => 'https://example.test',
        onPoll: async () => signedIn,
        pollIntervalMs: 50,
        timeoutMs: 10_000,
      }).then((r) => {
        settled = r;
      });
      await Promise.resolve();
    });

    await act(async () => {
      signedIn = true;
      await vi.advanceTimersByTimeAsync(120);
    });

    expect(settled).toEqual({ kind: 'ok' });
  });

  it('closing the window right after success still reports success', async () => {
    let signedIn = false;
    const { result } = renderHook(() => useOAuthPopup());
    let settled: unknown;

    await act(async () => {
      void result.current({
        provider: 'google',
        resolveUrl: async () => 'https://example.test',
        onPoll: async () => signedIn,
        pollIntervalMs: 50,
        timeoutMs: 10_000,
      }).then((r) => {
        settled = r;
      });
      await Promise.resolve();
    });

    await act(async () => {
      signedIn = true;
      popup!.closed = true;
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(settled).toEqual({ kind: 'ok' });
  });
});

describe('F4.8 — one flow per provider', () => {
  it('a second call while one is in flight reuses it instead of opening a window', async () => {
    const { result } = renderHook(() => useOAuthPopup());
    await act(async () => {
      void result.current({ provider: 'google', resolveUrl: async () => 'https://example.test' });
      void result.current({ provider: 'google', resolveUrl: async () => 'https://example.test' });
      await Promise.resolve();
    });
    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});

describe('F4.7 — listeners do not outlive the component', () => {
  it('unmounting mid-flow removes the message listener and clears the interval', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    const { result, unmount } = renderHook(() => useOAuthPopup());
    await act(async () => {
      void result.current({
        provider: 'google',
        resolveUrl: async () => 'https://example.test',
        pollIntervalMs: 50,
      });
      await Promise.resolve();
    });

    unmount();

    // Previously `cleanup()` ran only when the promise settled, so navigating
    // away left the listener bound and the interval polling for minutes.
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

describe('F4.1 / F3.13 — the copy names the cause', () => {
  it('never says "cancelled" for a provider error or a timeout', () => {
    const messageError = oauthFailureMessage(
      { kind: 'error', reason: 'message-error', error: 'access_denied' },
      'Google',
    );
    const timeout = oauthFailureMessage({ kind: 'error', reason: 'timeout' }, 'Google');

    expect(messageError).toContain('access_denied');
    expect(messageError.toLowerCase()).not.toContain('cancel');
    expect(timeout.toLowerCase()).not.toContain('cancel');
  });

  it('uses a display label, not the raw provider id', () => {
    // `${provider} sign-in failed.` produced "google sign-in failed."
    const msg = oauthFailureMessage({ kind: 'error', reason: 'closed' }, 'Google');
    expect(msg).toContain('Google');
    expect(msg).not.toContain('google ');
  });

  it('does not use developer vocabulary', () => {
    for (const reason of ['popup-blocked', 'closed', 'timeout', 'start-failed'] as const) {
      const msg = oauthFailureMessage({ kind: 'error', reason }, 'Google');
      expect(msg).not.toContain('OAuth');
    }
  });
});

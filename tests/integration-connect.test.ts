/**
 * F4.5 – F4.8 / P3-9 — the integration connect flow had its own popup.
 *
 * `useOAuthPopup` was extracted to be the one OAuth popup implementation, and
 * the sign-in page adopted it. The two copies it was extracted FROM —
 * `Sidebar.tsx` and `OnboardingFlow.tsx` — were never removed, so everything
 * the hook fixed stayed broken on the path most users take to connect a
 * calendar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useIntegrationConnect, integrationLabel } from '@/hooks/useIntegrationConnect';
import { isUserCancellation } from '@/hooks/useOAuthPopup';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

interface FakePopup {
  closed: boolean;
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  location: { href: string };
}

let popup: FakePopup;
let openSpy: ReturnType<typeof vi.fn>;

function postComplete(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', { origin: window.location.origin, data: detail }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  popup = { closed: false, focus: vi.fn(), close: vi.fn(), location: { href: 'about:blank' } };
  openSpy = vi.fn(() => popup);
  vi.stubGlobal('open', openSpy);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Start a connect flow and return a getter for its eventual result. */
async function startConnect(isConnected: () => Promise<boolean>) {
  const { result } = renderHook(() => useIntegrationConnect({ isConnected }));
  let settled: unknown;
  await act(async () => {
    void result.current('google').then((r) => {
      settled = r;
    });
    await Promise.resolve();
  });
  return () => settled as { kind: string; message?: string } | undefined;
}

describe('F4.5 — a decline is not a browser fault', () => {
  it('reports a cancellation, with none of the four false clauses', async () => {
    // The string this replaces, fired for a plain Cancel:
    //   "Google blocked browser/app context. OAuth failed. Connection was not
    //    completed. Try again in a regular browser window."
    const get = await startConnect(async () => false);

    await act(async () => {
      postComplete({
        type: 'lumina:oauth-complete',
        provider: 'google',
        success: false,
        error: 'access_denied',
      });
      await Promise.resolve();
    });

    const result = get()!;
    expect(result.kind).toBe('error');
    expect(result.message!.toLowerCase()).toContain('cancel');
    expect(result.message!.toLowerCase()).not.toContain('browser');
    expect(result.message).not.toContain('OAuth');
  });

  it('classifies the codes that actually mean "the user said no"', () => {
    expect(isUserCancellation('access_denied')).toBe(true);
    expect(isUserCancellation('ACCESS_DENIED')).toBe(true);
    expect(isUserCancellation('error=access_denied&error_description=denied')).toBe(true);
    // Microsoft's consent-cancel code.
    expect(isUserCancellation('AADSTS65004')).toBe(true);
  });

  it('and does NOT classify a real fault that merely mentions a browser', () => {
    // The old heuristic matched any error containing 'browser' or 'secure',
    // which is the whole reason a decline read as a compatibility failure.
    expect(isUserCancellation('unsupported_browser_configuration')).toBe(false);
    expect(isUserCancellation('insecure_transport')).toBe(false);
    expect(isUserCancellation('oauth_error')).toBe(false);
    expect(isUserCancellation('invalid_scope')).toBe(false);
    expect(isUserCancellation(null)).toBe(false);
    expect(isUserCancellation('')).toBe(false);
  });
});

describe('the connect flow confirms before claiming success', () => {
  it('reports ok once the server agrees the integration is connected', async () => {
    const get = await startConnect(async () => true);
    await act(async () => {
      postComplete({ type: 'lumina:oauth-complete', provider: 'google', success: true });
      await Promise.resolve();
    });
    expect(get()).toEqual({ kind: 'ok' });
  });

  it('says so plainly when OAuth finished but the status never flipped', async () => {
    const get = await startConnect(async () => false);
    await act(async () => {
      postComplete({ type: 'lumina:oauth-complete', provider: 'google', success: true });
      await vi.advanceTimersByTimeAsync(2_000);
    });
    const result = get()!;
    expect(result.kind).toBe('error');
    // The one old message that was accurate — kept, minus the boilerplate.
    expect(result.message).toContain("can't see the connection");
    expect(result.message).not.toContain('OAuth');
  });
});

describe('labels', () => {
  it('names the product, not the provider id', () => {
    expect(integrationLabel('google')).toBe('Google Calendar');
    expect(integrationLabel('microsoft')).toBe('Outlook');
  });
});

describe('P3-9 — there is ONE popup implementation left', () => {
  const files = [
    'src/components/Sidebar.tsx',
    'src/components/OnboardingFlow.tsx',
    'src/app/auth/signin/page.tsx',
  ];

  it('no component opens its own OAuth window any more', () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toContain('lumina-integration-');
      expect(src, f).not.toContain('popup=yes,width=');
    }
  });

  it('and none of them still builds its own failure copy', () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toContain('isGoogleBlockedContextError');
      expect(src, f).not.toContain('getIntegrationFailureMessage');
      expect(src, f).not.toContain('Try again in a regular browser window');
    }
  });

  it('F4.8 — one window name per provider, so two cannot be open at once', () => {
    // `lumina-oauth-google` and `lumina-integration-google` are different
    // names, so an onboarding user could have two Google popups open with two
    // independent listeners.
    const names = new Set<string>();
    for (const f of ['src/hooks/useOAuthPopup.ts', ...files]) {
      for (const m of read(f).matchAll(/`lumina-[a-z]+-\$\{provider\}`/g)) names.add(m[0]);
    }
    expect([...names]).toEqual(['`lumina-oauth-${provider}`']);
  });

  it('F4.6/F4.7 — the copies’ 3-minute timeout and leaky cleanup are gone', () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toContain('3 * 60 * 1000');
    }
    // The surviving implementation tears down on unmount, not only on settle.
    expect(read('src/hooks/useOAuthPopup.ts')).toContain('cleanupRef.current?.()');
  });
});

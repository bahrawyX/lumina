/**
 * P1-12 / P1-13 — transient provider failures were treated as permanent, and
 * permanent ones as transient.
 *
 * The sync catch-all marked `status: 'error'` for ANY thrown error, including a
 * rate limit or a 503. Once `status !== 'active'`, `get*AccessToken` throws
 * "not active" for every subsequent call — live event fetch included — so one
 * Google rate-limit blip silently killed the user's calendar until they noticed
 * and reconnected by hand.
 *
 * Meanwhile the live-read clients threw a generic `Error` on any non-2xx and
 * never inspected `res.status`, so a provider-side revocation left the
 * integration marked `active` forever and the UI never prompted a reconnect.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ProviderError,
  classifyStatus,
  clientFacingCode,
  isFatalProviderError,
  parseRetryAfter,
  providerErrorFromResponse,
  withProviderRetry,
} from '@/lib/integrations/providerError';

describe('classifyStatus — the distinction the old code never made', () => {
  it('401 and 403 mean the credentials are dead', () => {
    expect(classifyStatus(401)).toBe('reconnect_required');
    expect(classifyStatus(403)).toBe('reconnect_required');
  });

  it('invalid_grant is fatal even when it arrives as a 400', () => {
    // The canonical "this refresh token is dead" signal from a token endpoint.
    expect(classifyStatus(400, '{"error":"invalid_grant"}')).toBe('reconnect_required');
  });

  it('429 is a rate limit, NOT a dead integration', () => {
    expect(classifyStatus(429)).toBe('rate_limited');
  });

  it('5xx is a provider fault, NOT a dead integration', () => {
    expect(classifyStatus(500)).toBe('provider_unavailable');
    expect(classifyStatus(503)).toBe('provider_unavailable');
  });
});

describe('isFatalProviderError — only credential failures kill an integration', () => {
  const make = (status: number, body = '') =>
    new ProviderError({
      provider: 'google',
      kind: classifyStatus(status, body),
      status,
      message: 'x',
    });

  it('is true for 401/403', () => {
    expect(isFatalProviderError(make(401))).toBe(true);
    expect(isFatalProviderError(make(403))).toBe(true);
  });

  it('is FALSE for a rate limit — this is the whole finding', () => {
    expect(isFatalProviderError(make(429))).toBe(false);
  });

  it('is FALSE for a 503', () => {
    expect(isFatalProviderError(make(503))).toBe(false);
  });

  it('is false for a non-provider error, so an unrelated bug cannot disable a calendar', () => {
    expect(isFatalProviderError(new Error('boom'))).toBe(false);
    expect(isFatalProviderError('nope')).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('reads a seconds value', () => {
    expect(parseRetryAfter('30')).toBe(30);
  });

  it('reads an HTTP date', () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const parsed = parseRetryAfter(future);
    expect(parsed).toBeGreaterThan(50);
    expect(parsed).toBeLessThanOrEqual(60);
  });

  it('returns null for junk or a missing header', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('providerErrorFromResponse — P3-3, no provider text reaches the client', () => {
  it('does not put the response body in the message', () => {
    // These strings were forwarded verbatim to clients and read like
    // `[microsoft/client] Graph API 403 at <url>: <full response body>`.
    const res = new Response('{"error":"secret internal detail"}', { status: 403 });
    const err = providerErrorFromResponse('microsoft', res, '{"error":"secret internal detail"}', '/me/events');
    expect(err.message).not.toContain('secret internal detail');
    expect(err.kind).toBe('reconnect_required');
  });

  it('exposes only a coarse code to callers', () => {
    const res = new Response('', { status: 429, headers: { 'retry-after': '12' } });
    const err = providerErrorFromResponse('google', res, '', '/calendars');
    expect(clientFacingCode(err)).toBe('rate_limited');
    expect(err.retryAfterSeconds).toBe(12);
  });

  it('reports "unknown" for a non-provider error rather than leaking it', () => {
    expect(clientFacingCode(new Error('internal: DATABASE_URL=...'))).toBe('unknown');
  });
});

describe('withProviderRetry — bounded retry, only for transient kinds', () => {
  const fatal = () =>
    new ProviderError({ provider: 'google', kind: 'reconnect_required', status: 401, message: 'x' });
  const transient = (retryAfterSeconds?: number) =>
    new ProviderError({
      provider: 'google',
      kind: 'rate_limited',
      status: 429,
      message: 'x',
      retryAfterSeconds,
    });

  it('returns the value on first success', async () => {
    const fn = vi.fn(async () => 'ok');
    await expect(withProviderRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limit and succeeds', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw transient(0);
      return 'recovered';
    });
    await expect(withProviderRetry(fn, { maxAttempts: 4, maxDelayMs: 0 })).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a credential failure — retrying cannot help', async () => {
    const fn = vi.fn(async () => {
      throw fatal();
    });
    await expect(withProviderRetry(fn, { maxDelayMs: 0 })).rejects.toBeInstanceOf(ProviderError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry an ordinary Error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('bug in our code');
    });
    await expect(withProviderRetry(fn, { maxDelayMs: 0 })).rejects.toThrow('bug in our code');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts and rethrows the last error', async () => {
    const fn = vi.fn(async () => {
      throw transient(0);
    });
    await expect(withProviderRetry(fn, { maxAttempts: 3, maxDelayMs: 0 })).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('caps the delay so a hostile Retry-After cannot pin a function open', async () => {
    const started = Date.now();
    const fn = vi.fn(async () => {
      throw transient(86_400); // "come back in a day"
    });
    await expect(withProviderRetry(fn, { maxAttempts: 2, maxDelayMs: 20 })).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

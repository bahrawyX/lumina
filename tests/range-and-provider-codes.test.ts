/**
 * P1-10 — `/api/intelligence` and `/api/sync/*` had no limit and no range cap.
 *
 * `?start=1970-01-01&end=2100-01-01` triggered a fully paginated fetch of every
 * connected calendar, and `/api/intelligence` additionally reads the caller's
 * entire tasks table and CPU-expands every recurrence rule. Because the OAuth
 * client is shared, **one account could exhaust the Google/Graph quota for
 * every user of the app.**
 *
 * P3-3 — those same routes returned `err.message` verbatim, which reads like
 * `[microsoft/client] Graph API 403 at <url>: <full response body>`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_PROVIDER_RANGE_DAYS,
  MAX_RANGE_DAYS,
  parseRange,
} from '@/lib/dateRange';
import { integrationErrorCode } from '@/lib/integrations/clientError';
import { ProviderError } from '@/lib/integrations/providerError';

const DAY = 24 * 60 * 60 * 1000;
const base = new Date('2026-08-24T00:00:00.000Z');
const defaults = { defaultStart: base, defaultEnd: new Date(base.getTime() + 7 * DAY) };

describe('P1-10 — the range is capped', () => {
  it('accepts a window inside the cap', () => {
    const r = parseRange('2026-08-01T00:00:00Z', '2026-08-20T00:00:00Z', defaults);
    expect(r.kind).toBe('ok');
  });

  it('REJECTS the unbounded window that could drain the shared quota', () => {
    const r = parseRange('1970-01-01T00:00:00Z', '2100-01-01T00:00:00Z', {
      ...defaults,
      maxDays: MAX_PROVIDER_RANGE_DAYS,
    });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toContain('Maximum');
  });

  it('rejects rather than silently truncating', () => {
    // A caller asking for five years and getting one back, with no indication,
    // produces a UI that quietly shows incomplete data. `/api/events/expand`
    // already made this choice; this keeps it.
    const r = parseRange('2020-01-01T00:00:00Z', '2030-01-01T00:00:00Z', defaults);
    expect(r.kind).toBe('error');
  });

  it('falls back to the defaults when no params are given', () => {
    const r = parseRange(null, null, defaults);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.start.toISOString()).toBe(base.toISOString());
    }
  });

  it('rejects an unparseable date instead of producing NaN bounds', () => {
    expect(parseRange('not-a-date', '2026-08-20T00:00:00Z', defaults).kind).toBe('error');
  });

  it('rejects an inverted range', () => {
    expect(parseRange('2026-08-20T00:00:00Z', '2026-08-01T00:00:00Z', defaults).kind).toBe('error');
  });

  it('the provider cap is tighter than the general one', () => {
    // Provider-backed routes pay per request; the local expansion route does not.
    expect(MAX_PROVIDER_RANGE_DAYS).toBeLessThan(MAX_RANGE_DAYS);
  });

  it('exactly at the cap is accepted; one day over is not', () => {
    const at = parseRange(
      base.toISOString(),
      new Date(base.getTime() + MAX_PROVIDER_RANGE_DAYS * DAY).toISOString(),
      { ...defaults, maxDays: MAX_PROVIDER_RANGE_DAYS },
    );
    const over = parseRange(
      base.toISOString(),
      new Date(base.getTime() + (MAX_PROVIDER_RANGE_DAYS + 1) * DAY).toISOString(),
      { ...defaults, maxDays: MAX_PROVIDER_RANGE_DAYS },
    );
    expect(at.kind).toBe('ok');
    expect(over.kind).toBe('error');
  });
});

describe('P3-3 — no provider text reaches the client', () => {
  it('maps a ProviderError kind to an actionable code', () => {
    const make = (kind: 'reconnect_required' | 'rate_limited' | 'provider_unavailable') =>
      new ProviderError({ provider: 'google', kind, status: 429, message: 'x' });

    expect(integrationErrorCode(make('reconnect_required'))).toBe('reconnect_required');
    expect(integrationErrorCode(make('rate_limited'))).toBe('rate_limited');
    expect(integrationErrorCode(make('provider_unavailable'))).toBe('provider_unavailable');
  });

  it('recognises our own not-connected strings', () => {
    expect(integrationErrorCode(new Error('No Google integration found'))).toBe('not_connected');
    expect(integrationErrorCode(new Error('No Microsoft integration found'))).toBe('not_connected');
  });

  it('recognises our own dead-credential strings', () => {
    expect(integrationErrorCode(new Error('Google integration is not active'))).toBe(
      'reconnect_required',
    );
    expect(integrationErrorCode(new Error('Google refresh token missing'))).toBe(
      'reconnect_required',
    );
  });

  it('never returns a provider diagnostic for an unrecognised error', () => {
    const leaky = new Error('[microsoft/client] Graph API 403 at https://internal/x: {"secret":1}');
    expect(integrationErrorCode(leaky)).toBe('provider_error');
  });
});

describe('P1-10 / P3-3 — the routes actually use them', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

  for (const [name, parts] of [
    ['intelligence', ['src', 'app', 'api', 'intelligence', 'route.ts']],
    ['external-events/[provider]', ['src', 'app', 'api', 'external-events', '[provider]', 'route.ts']],
  ] as const) {
    it(`${name} clamps the range`, () => {
      expect(read(...parts)).toContain('parseRange(');
    });
  }

  for (const route of ['all', 'google', 'outlook']) {
    it(`sync/${route} is rate limited`, () => {
      const src = read('src', 'app', 'api', 'sync', route, 'route.ts');
      expect(src).toContain('createRateLimiter');
    });
  }

  it('intelligence is rate limited', () => {
    expect(read('src', 'app', 'api', 'intelligence', 'route.ts')).toContain('createRateLimiter');
  });

  for (const [name, parts] of [
    ['sync/google', ['src', 'app', 'api', 'sync', 'google', 'route.ts']],
    ['sync/outlook', ['src', 'app', 'api', 'sync', 'outlook', 'route.ts']],
    ['external-events/[provider]', ['src', 'app', 'api', 'external-events', '[provider]', 'route.ts']],
  ] as const) {
    it(`${name} no longer returns the raw message`, () => {
      const src = read(...parts);
      // `{ error: message }` was the shape that leaked the provider string.
      expect(src).not.toContain('{ error: message }');
      expect(src).toContain('integrationErrorCode');
    });
  }
});

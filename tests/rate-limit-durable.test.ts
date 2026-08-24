/**
 * P1-9 / F3.1 — rate limiting must survive concurrency and multiple instances.
 *
 * The old limiters were module-level `Map`s. Fired sequentially they looked
 * correct; fired concurrently against production, 15 of 16 sign-in attempts
 * were processed, because every concurrent request landed on a fresh lambda
 * with its own counter starting at zero.
 *
 * These tests run the REAL `createRateLimiter` against a real (in-process)
 * Postgres, and the decisive one issues all requests concurrently — the exact
 * shape that defeated the old implementation.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const DDL = `
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  last_request bigint NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
);
CREATE UNIQUE INDEX IF NOT EXISTS rate_limits_key_uniq ON rate_limits (key);
CREATE INDEX IF NOT EXISTS rate_limits_expires_at_idx ON rate_limits (expires_at);
`;

const client = new PGlite();
const testDb = drizzle(client);

vi.mock('@/lib/db', () => ({
  getDatabase: () => testDb,
  db: testDb,
}));

let createRateLimiter: typeof import('@/lib/rateLimit')['createRateLimiter'];
let clientIp: typeof import('@/lib/rateLimit')['clientIp'];
let sweepExpiredRateLimits: typeof import('@/lib/rateLimit')['sweepExpiredRateLimits'];

beforeAll(async () => {
  await client.exec(DDL);
  const mod = await import('@/lib/rateLimit');
  createRateLimiter = mod.createRateLimiter;
  clientIp = mod.clientIp;
  sweepExpiredRateLimits = mod.sweepExpiredRateLimits;
});

afterAll(async () => {
  await client.close();
});

describe('P1-9 — the counter is shared, not per-instance', () => {
  it('allows exactly `max` sequential requests, then limits', async () => {
    const limiter = createRateLimiter('seqTest', { windowMs: 60_000, max: 3 });
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await limiter.check('user-seq'));
    }
    expect(results.map((r) => r.limited)).toEqual([false, false, false, true, true, true]);
  });

  it('CONCURRENT requests cannot exceed `max` — the case that defeated the Map', async () => {
    // This is the reproduction from the audit, inverted into an assertion:
    // 16 simultaneous attempts previously produced 15 processed / 1 limited.
    const limiter = createRateLimiter('concurrentTest', { windowMs: 60_000, max: 5 });
    const outcomes = await Promise.all(
      Array.from({ length: 16 }, () => limiter.check('user-concurrent')),
    );
    const allowed = outcomes.filter((r) => !r.limited).length;
    expect(allowed).toBe(5);
    expect(outcomes.filter((r) => r.limited).length).toBe(11);
  });

  it('two limiter instances with the same name share one counter (simulating two lambdas)', async () => {
    const lambdaA = createRateLimiter('sharedName', { windowMs: 60_000, max: 2 });
    const lambdaB = createRateLimiter('sharedName', { windowMs: 60_000, max: 2 });

    expect((await lambdaA.check('u')).limited).toBe(false);
    expect((await lambdaB.check('u')).limited).toBe(false);
    // A fresh "instance" must NOT get a fresh allowance.
    expect((await lambdaB.check('u')).limited).toBe(true);
  });

  it('different subjects have independent counters', async () => {
    const limiter = createRateLimiter('perSubject', { windowMs: 60_000, max: 1 });
    expect((await limiter.check('alice')).limited).toBe(false);
    expect((await limiter.check('bob')).limited).toBe(false);
    expect((await limiter.check('alice')).limited).toBe(true);
  });

  it('different limiter names have independent counters', async () => {
    const a = createRateLimiter('nameA', { windowMs: 60_000, max: 1 });
    const b = createRateLimiter('nameB', { windowMs: 60_000, max: 1 });
    expect((await a.check('same')).limited).toBe(false);
    expect((await b.check('same')).limited).toBe(false);
  });

  it('reports a retryAfter within the window', async () => {
    const limiter = createRateLimiter('retryAfter', { windowMs: 60_000, max: 1 });
    await limiter.check('x');
    const limited = await limiter.check('x');
    expect(limited.limited).toBe(true);
    expect(limited.retryAfterMs).toBeGreaterThan(0);
    expect(limited.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});

describe('P1-9 — /api/contact keyed on a spoofable header', () => {
  it('prefers the platform header over the client-controlled chain', () => {
    // `x-forwarded-for` is a chain a client can PREPEND to, so its first entry
    // is attacker-controlled. Rotating it removed the cooldown entirely and
    // added a permanent Map entry per spoofed value.
    const headers = new Headers({
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'x-vercel-forwarded-for': '9.9.9.9',
    });
    expect(clientIp(headers)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '8.8.8.8', 'x-forwarded-for': 'spoofed' });
    expect(clientIp(headers)).toBe('8.8.8.8');
  });

  it('takes the LAST x-forwarded-for entry, which the nearest trusted proxy appended', () => {
    const headers = new Headers({ 'x-forwarded-for': 'spoofed-by-client, 203.0.113.7' });
    expect(clientIp(headers)).toBe('203.0.113.7');
  });

  it('never returns an empty string', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('P1-9 — counters do not grow forever', () => {
  it('the sweep deletes expired rows', async () => {
    await client.exec(`
      INSERT INTO rate_limits (key, count, last_request, expires_at)
      VALUES ('stale:1', 5, 0, now() - interval '2 days')
    `);
    const before = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM rate_limits WHERE key = 'stale:1'`,
    );
    expect(before.rows[0].n).toBe(1);

    await sweepExpiredRateLimits();

    const after = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM rate_limits WHERE key = 'stale:1'`,
    );
    expect(after.rows[0].n).toBe(0);
  });

  it('the sweep leaves live rows alone', async () => {
    const limiter = createRateLimiter('liveRow', { windowMs: 60_000, max: 5 });
    await limiter.check('keep-me');
    await sweepExpiredRateLimits();
    const res = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM rate_limits WHERE key LIKE 'liveRow:%'`,
    );
    expect(res.rows[0].n).toBe(1);
  });
});

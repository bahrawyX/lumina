/**
 * Batch 8 #4 — OAuth token-refresh race (M3) regression tests.
 *
 * Exercises the REAL token path (SELECT … FOR UPDATE inside a transaction, with a
 * re-check after acquiring the lock) against an in-process Postgres (PGlite).
 * Proves:
 *   1. Concurrent refreshers hit the IdP EXACTLY ONCE (critical for Microsoft's
 *      rotating refresh tokens — a second refresh would burn the token).
 *   2. A timed-out refresh rolls back cleanly: the row keeps its previous token
 *      (never nulled / never a partial write), so a retry starts clean.
 *
 * SERIALIZATION CAVEAT (TD-3): PGlite is a single connection, so Promise.all here
 * serializes. This validates the lock+re-check LOGIC (second caller refreshes
 * zero times), not true parallel row-lock contention — that multi-connection test
 * is tracked in TD-3 for Batch 9.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  makeIntegrationsTestDb,
  seedIntegration,
  getIntegration,
  type IntegrationsTestDb,
} from './helpers/integrationsTestDb';

const h = vi.hoisted(() => ({ db: null as unknown as IntegrationsTestDb['db'] }));
vi.mock('@/lib/db', () => ({ getDatabase: () => h.db }));

import { getGoogleAccessToken } from '@/lib/integrations/google/token';
import { getMicrosoftAccessToken } from '@/lib/integrations/microsoft/token';

let client: IntegrationsTestDb['client'];

/** A fetch stub that returns a fresh token and counts how many times it ran. */
function makeTokenFetch(accessToken: string) {
  const state = { calls: 0 };
  const fn = vi.fn(async () => {
    state.calls++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: accessToken, expires_in: 3600 }),
      text: async () => '',
    } as unknown as Response;
  });
  return { fn, state };
}

/** A fetch stub that simulates AbortSignal.timeout firing. */
function makeTimeoutFetch() {
  return vi.fn(async () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  });
}

beforeEach(async () => {
  const t = await makeIntegrationsTestDb();
  h.db = t.db;
  client = t.client;
  process.env.GOOGLE_CLIENT_ID_CALENDAR = 'gid';
  process.env.GOOGLE_CLIENT_SECRET_CALENDAR = 'gsecret';
  process.env.MICROSOFT_CLIENT_ID = 'mid';
  process.env.MICROSOFT_CLIENT_SECRET = 'msecret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M3 — Google: concurrent refresh single-flights to one IdP call', () => {
  it('two concurrent getGoogleAccessToken calls refresh exactly once', async () => {
    const expired = new Date(Date.now() - 60_000);
    const userId = await seedIntegration(client, {
      provider: 'google',
      accessToken: 'old-access',
      refreshToken: 'r0',
      expiresAt: expired,
    });
    const { fn, state } = makeTokenFetch('new-google-access');
    vi.stubGlobal('fetch', fn);

    const [a, b] = await Promise.all([
      getGoogleAccessToken(userId),
      getGoogleAccessToken(userId),
    ]);

    expect(state.calls).toBe(1); // IdP hit once, not twice
    expect(a).toBe('new-google-access');
    expect(b).toBe('new-google-access');

    const row = await getIntegration(client, userId, 'google');
    expect(row.access_token).toBe('new-google-access');
  });

  it('valid token takes the unlocked fast path (no refresh)', async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const userId = await seedIntegration(client, {
      provider: 'google',
      accessToken: 'still-good',
      refreshToken: 'r0',
      expiresAt: future,
    });
    const { fn, state } = makeTokenFetch('should-not-be-used');
    vi.stubGlobal('fetch', fn);

    const token = await getGoogleAccessToken(userId);

    expect(token).toBe('still-good');
    expect(state.calls).toBe(0);
  });
});

describe('M3 — Microsoft: rotating refresh token is not burned twice', () => {
  it('two concurrent getMicrosoftAccessToken calls refresh exactly once', async () => {
    const expired = new Date(Date.now() - 60_000);
    const userId = await seedIntegration(client, {
      provider: 'microsoft',
      accessToken: 'old-access',
      refreshToken: 'r0',
      expiresAt: expired,
    });
    const { fn, state } = makeTokenFetch('new-ms-access');
    vi.stubGlobal('fetch', fn);

    const [a, b] = await Promise.all([
      getMicrosoftAccessToken(userId),
      getMicrosoftAccessToken(userId),
    ]);

    expect(state.calls).toBe(1);
    expect(a).toBe('new-ms-access');
    expect(b).toBe('new-ms-access');
  });
});

describe('M3 — a timed-out refresh rolls back and preserves the old token', () => {
  it('aborts cleanly, keeps the previous token, never writes a partial row', async () => {
    const expired = new Date(Date.now() - 60_000);
    const userId = await seedIntegration(client, {
      provider: 'google',
      accessToken: 'old-access',
      refreshToken: 'r0',
      expiresAt: expired,
    });
    vi.stubGlobal('fetch', makeTimeoutFetch());

    await expect(getGoogleAccessToken(userId)).rejects.toThrow(/timed out/i);

    // Old token intact — not nulled, not a placeholder, not empty.
    const row = await getIntegration(client, userId, 'google');
    expect(row.access_token).toBe('old-access');
    expect(row.refresh_token).toBe('r0');

    // A retry after the IdP recovers starts clean and succeeds.
    const { fn, state } = makeTokenFetch('recovered-access');
    vi.stubGlobal('fetch', fn);
    const token = await getGoogleAccessToken(userId);
    expect(token).toBe('recovered-access');
    expect(state.calls).toBe(1);
  });
});

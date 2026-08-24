/**
 * P0-2 / P0-3 — a failed fetch must not be indistinguishable from "no data".
 *
 * Every `fetchAll*` used to be:
 *
 *     if (!res.ok) return [];    // 500, 401, 403 → "no tasks"
 *     } catch { return []; }     // offline, DNS, abort → "no tasks"
 *
 * so a 500 hydrated the store with `[]` and the user saw an empty board with no
 * error and no retry. These tests exercise the real path — the exported
 * persistence functions against a stubbed `fetch` — rather than unit-testing a
 * helper, so they fail if anyone reintroduces the swallow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as tasksPersistence from '@/lib/persistence/tasksPersistence';
import * as goalsPersistence from '@/lib/persistence/goalsPersistence';
import * as focusPersistence from '@/lib/persistence/focusPersistence';
import * as coinsPersistence from '@/lib/persistence/coinsPersistence';
import { onUnauthorized } from '@/lib/persistence/apiClient';

const realFetch = globalThis.fetch;

function respondWith(init: { status?: number; body?: unknown } = {}) {
  const status = init.status ?? 200;
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(init.body ?? []), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

function rejectWith(err: Error) {
  globalThis.fetch = vi.fn(async () => {
    throw err;
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('P0-2 — a real empty list is reported as success', () => {
  beforeEach(() => respondWith({ status: 200, body: [] }));

  it('tasks: 200 [] is ok with zero rows, not a failure', async () => {
    const r = await tasksPersistence.fetchAllForCurrentUser();
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.data).toEqual([]);
  });

  it('goals: 200 [] is ok with zero rows', async () => {
    const r = await goalsPersistence.fetchAllForCurrentUser();
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.data).toEqual([]);
  });
});

describe('P0-2 — HTTP failures are reported as failures, never as empty', () => {
  for (const status of [401, 403, 500, 502]) {
    it(`tasks: ${status} is an error carrying the status`, async () => {
      respondWith({ status, body: { error: 'nope' } });
      const r = await tasksPersistence.fetchAllForCurrentUser();
      expect(r.kind).toBe('error');
      if (r.kind === 'error') expect(r.status).toBe(status);
    });
  }

  it('focus: 500 is an error', async () => {
    respondWith({ status: 500 });
    const r = await focusPersistence.fetchAllForCurrentUser();
    expect(r.kind).toBe('error');
  });

  it('coins: 500 does not resolve to a zero balance', async () => {
    respondWith({ status: 500 });
    const r = await coinsPersistence.fetchCoinsData();
    expect(r.kind).toBe('error');
    // The old behaviour returned defaultCoinsData(), i.e. balance 0 and an
    // empty inventory — telling the user they lost everything they earned.
    expect(r).not.toHaveProperty('data.balance', 0);
  });
});

describe('P0-2 — network failures are reported as failures, never as empty', () => {
  it('tasks: a rejected fetch is status "network"', async () => {
    rejectWith(new TypeError('Failed to fetch'));
    const r = await tasksPersistence.fetchAllForCurrentUser();
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.status).toBe('network');
  });

  it('goals: a rejected fetch is status "network"', async () => {
    rejectWith(new TypeError('Failed to fetch'));
    const r = await goalsPersistence.fetchAllForCurrentUser();
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.status).toBe('network');
  });
});

describe('P0-2 — a non-array 2xx body is a parse failure, not an empty list', () => {
  it('tasks: an object body reports "parse" rather than silently emptying', async () => {
    respondWith({ status: 200, body: { unexpected: true } });
    const r = await tasksPersistence.fetchAllForCurrentUser();
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.status).toBe('parse');
  });
});

describe('F5.2 — a 401 notifies the session-expiry interceptor', () => {
  it('fires listeners exactly once per 401 response', async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    respondWith({ status: 401 });

    await tasksPersistence.fetchAllForCurrentUser();
    expect(seen).toHaveBeenCalledTimes(1);

    off();
    await tasksPersistence.fetchAllForCurrentUser();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('does not fire on a successful response', async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    respondWith({ status: 200, body: [] });

    await tasksPersistence.fetchAllForCurrentUser();
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});

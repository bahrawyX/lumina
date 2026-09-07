/**
 * A slow request is not a failed one.
 *
 * `AppShell` carried a 3-second wall-clock timer and, on expiry, marked events,
 * tasks and focus as network FAILURES — putting the retry banner on screen.
 * That is a stopwatch inferring an outcome. Elapsed time says nothing about
 * whether a request will succeed.
 *
 * It mattered because Neon's free tier suspends the database after ~5 minutes
 * idle and the next request pays a multi-second cold start. So the first visit
 * of most sessions showed "we couldn't load your data" and then loaded the data
 * a second later — the app calling itself broken while working correctly.
 *
 * The timer existed because `apiFetch` was UNBOUNDED: without some cap a hung
 * request would pin a `fixed inset-0 z-[9999]` overlay forever. Bounding the
 * fetch is what lets the guess be deleted — a request that will never answer
 * now aborts, throws, and is caught as `fail('network')` by the request that
 * actually failed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Keeps the module's own session gate out of the way; it is not what is under
// test here and it only affects non-GET requests.
vi.mock('@/lib/auth/sessionState', () => ({
  isSessionExpired: () => false,
  notifyUnauthorized: () => {},
  markActive: () => {},
}));

import { apiFetch, apiGetJson } from '@/lib/persistence/apiClient';

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('fetch', fetchMock);
});

describe('every request is bounded', () => {
  it('attaches an abort signal when the caller gives none', async () => {
    // The point of the change. Unbounded, a hung request never resolves, so
    // nothing downstream can ever distinguish it from one still in flight.
    await apiFetch('/api/tasks');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("lets an explicit caller signal win", async () => {
    // Set AFTER the `...init` spread precisely so this holds — a caller that
    // manages its own cancellation must not have it silently replaced.
    const controller = new AbortController();
    await apiFetch('/api/tasks', { signal: controller.signal });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it('reports an aborted request as a network failure, not as emptiness', async () => {
    // What makes deleting the timer safe: the abort becomes a real, recorded
    // outcome rather than something a clock had to guess at.
    const abortError = new Error('The operation was aborted');
    abortError.name = 'TimeoutError';
    fetchMock.mockRejectedValueOnce(abortError);

    const result = await apiGetJson('/api/tasks');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.status).toBe('network');
  });

  it('leaves a slow-but-successful request alone', async () => {
    // The case that was being misreported. A cold start is simply awaited.
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(jsonResponse({ id: 1 })), 50)),
    );

    const result = await apiGetJson<{ id: number }>('/api/tasks');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.data).toEqual({ id: 1 });
  });
});

describe('AppShell no longer infers failure from a clock', () => {
  const shell = readFileSync(join(process.cwd(), 'src/app/(app)/AppShell.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('has no 3-second hydration timer left', () => {
    // The defect in one number: the marking fired because 3 seconds had passed,
    // not because anything had failed.
    expect(shell).not.toContain('3000');
  });

  it('still marks failure, but gated on the escape hatch rather than a short timer', () => {
    /**
     * F5.6's property has to survive this change: the overlay must never
     * dismiss into a board that is empty for an unknown reason, because "you
     * have no data" and "we could not load it" look identical and any edit made
     * in that window writes against empty state.
     *
     * So the marking stays — the GATE is what changed. Deleting it outright was
     * the first version of this fix, and `landing-polish-and-overlay.test.ts`
     * correctly failed on it.
     */
    expect(shell).toContain('markHydrationFailed');

    const guard = shell.slice(shell.indexOf('markHydrationFailed'));
    expect(guard).toContain('if (!hydrationEscapeHatch) return;');
    expect(guard).not.toContain('if (!hydrationTimeoutFired) return;');
  });

  it('keeps a last-resort dismissal, set past the request bound', () => {
    // Still needed: the overlay is fixed inset-0 z-[9999], so if
    // PersistenceBootstrap never mounts nothing else would unblock the UI.
    // It must sit above apiFetch's 30s cap, so every real failure has already
    // been recorded by the time it can fire.
    expect(shell).toContain('35_000');
    expect(shell).toContain('hydrationEscapeHatch');
  });

  it('changes the wording while waiting, rather than the state', () => {
    expect(shell).toContain('slowHydration');
    expect(shell).toMatch(/Still loading/);
  });
});

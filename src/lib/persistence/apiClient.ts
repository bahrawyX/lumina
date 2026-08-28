/**
 * apiClient.ts — the one HTTP entry point for every client-side persistence
 * module.
 *
 * ## Why this exists
 *
 * Each of the ten persistence modules used to carry its own private copy of
 * `apiBase()` + `apiFetch()`, and every `fetchAll*` collapsed all failure into
 * the empty array:
 *
 *     const res = await apiFetch('/api/tasks');
 *     if (!res.ok) return [];        // 500, 401, 403 → "no tasks"
 *     ...
 *     } catch { return []; }         // offline, DNS, abort → "no tasks"
 *
 * A 500, an expired session and a flaky connection all hydrated the store with
 * `[]`, so the user saw an empty calendar, an empty board and zero goals — with
 * no error message and no retry, indistinguishable from a brand-new account.
 * For a productivity app that is the worst available failure mode: the rational
 * response to "all my data is gone" is to stop trusting the product, and some
 * fraction of users will re-enter data on top of data that was never lost.
 *
 * `FetchResult<T>` makes the two cases distinguishable at the type level, so a
 * caller physically cannot treat "the request failed" as "there is no data"
 * without saying so.
 *
 * ## Why `kind: 'ok' | 'error'` and not `ok: boolean`
 *
 * `tsconfig.json` has `strict: false`, and with `strictNullChecks` off
 * TypeScript widens boolean *literal* types — so `if (!result.ok)` does not
 * narrow a `{ ok: true } | { ok: false }` union and every failure branch fails
 * to compile. A string discriminant narrows correctly under both settings, so
 * this survives the eventual `strict: true` flip either way.
 */

import { isSessionExpired } from '@/store/useSessionStore';

/** A request that did not produce a usable body. */
export type FetchFailure = {
  kind: 'error';
  /**
   * The HTTP status, or `'network'` when the request never completed — offline,
   * DNS failure, CORS, abort. `'parse'` when a 2xx body was not the expected
   * shape, which is a server bug rather than a user-visible outage.
   */
  status: number | 'network' | 'parse';
};

export type FetchSuccess<T> = { kind: 'ok'; data: T };
export type FetchResult<T> = FetchSuccess<T> | FetchFailure;

export const ok = <T,>(data: T): FetchSuccess<T> => ({ kind: 'ok', data });
export const fail = (status: FetchFailure['status']): FetchFailure => ({ kind: 'error', status });

/**
 * Relative on the client; absolute on the server, where `fetch` has no origin.
 * Historically each module spelled this slightly differently — two defaulted to
 * `''` and one to `http://localhost:3000`.
 */
export function apiBase(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

/** Listeners notified when any API call comes back 401. */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Subscribe to "the server says this session is no longer valid".
 *
 * A 401 is the only signal the client gets that a session died mid-use — and
 * without a listener it was previously swallowed into an empty array, so the
 * user kept typing into an app that could no longer save anything. Returns an
 * unsubscribe function.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      /* a broken listener must not break the request that triggered it */
    }
  }
}

/**
 * `fetch` with the JSON content-type default and the 401 interceptor attached.
 *
 * Returns the raw `Response` — callers that need status-specific handling (a
 * 409 conflict on doc save, a 429 on an AI route) read it directly. Callers
 * that just want a parsed body should use `apiGetJson` / `apiGetList`.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // F5.2: `isSessionExpired()` documented itself as the guard write paths call
  // before issuing a mutation — and had ZERO callers anywhere in the codebase.
  // So once a session was known dead, every optimistic update still went ahead,
  // failed, and left the user working on state that would vanish on reload:
  // exactly what the helper was written to prevent.
  //
  // Enforcing it here rather than at ~60 call sites is what makes it true for
  // all of them, including ones added later. Reads are deliberately still
  // allowed: a stale GET renders nothing worse than stale data, while a
  // refused one turns a recoverable session expiry into an empty app.
  //
  // The gate lifts by itself — `markActive` clears `expired` the moment a
  // session is re-established.
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && isSessionExpired()) {
    return new Response(
      JSON.stringify({ error: 'session_expired' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const res = await fetch(`${apiBase()}${path}`, {
    // Same-origin in the browser (apiBase is ''), so this is a no-op there; it
    // preserves the explicit `include` that docsPersistence carried.
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 401) notifyUnauthorized();
  return res;
}

/** GET `path` and parse the JSON body, distinguishing failure from emptiness. */
export async function apiGetJson<T>(path: string, init?: RequestInit): Promise<FetchResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    return fail('network');
  }
  if (!res.ok) return fail(res.status);
  // P2-7: the list endpoints cap how many rows they will return. The cap is
  // deliberately high enough that no ordinary account reaches it, but a cut
  // nobody can see is worse than no cut at all — so when the server says it
  // truncated, say so somewhere a developer will find it.
  if (res.headers.get('X-Result-Truncated') === 'true') {
    console.warn(
      `[apiClient] ${path} was truncated at ${res.headers.get('X-Result-Limit')} rows. ` +
        'Narrow the request with ?from/?to or ?limit.',
    );
  }
  try {
    return ok((await res.json()) as T);
  } catch {
    return fail('parse');
  }
}

/**
 * As `apiGetJson`, but asserts the body is an array and maps each element.
 *
 * A 2xx body that isn't an array is reported as `'parse'` rather than silently
 * becoming `[]` — the previous `if (!Array.isArray(data)) return []` hid real
 * server-shape regressions behind an empty screen.
 */
export async function apiGetList<T, R = T>(
  path: string,
  map?: (item: T) => R,
  init?: RequestInit,
): Promise<FetchResult<R[]>> {
  const result = await apiGetJson<unknown>(path, init);
  if (result.kind === 'error') return result;
  if (!Array.isArray(result.data)) return fail('parse');
  const items = result.data as T[];
  return ok(map ? items.map(map) : (items as unknown as R[]));
}

/**
 * True when the failure means "you are not signed in" rather than "something
 * broke". The UI response differs: re-authenticate vs. retry.
 */
export function isAuthFailure(failure: FetchFailure): boolean {
  return failure.status === 401 || failure.status === 403;
}

/** Human-readable cause, for the retry banner. */
export function describeFailure(failure: FetchFailure): string {
  if (failure.status === 'network') return "We couldn't reach the server.";
  if (failure.status === 'parse') return 'The server sent an unexpected response.';
  if (failure.status === 401) return 'Your session has expired.';
  if (failure.status === 403) return "You don't have access to this.";
  if (typeof failure.status === 'number' && failure.status >= 500) return 'The server is having trouble.';
  return 'That request was rejected.';
}

// ── Request de-duplication ───────────────────────────────────────────────────

/**
 * In-flight coalescing plus a short freshness window, for GETs that several
 * unrelated components each ask for on the same page load.
 *
 * P1-15: `/api/integrations/status` and `/api/users/preferences` were each
 * fetched **twice** per load — `PersistenceBootstrap` + `Sidebar`, and
 * `PersistenceBootstrap` + `streakPersistence` respectively. There is no
 * SWR/React Query and no fetch dedupe anywhere: 58 `fetch('/api/...')` call
 * sites across 28 files, and the one `singleFlight` helper has exactly one
 * consumer.
 *
 * This is deliberately tiny rather than a caching layer. It coalesces
 * concurrent callers onto one request and serves a result for a few seconds so
 * two components mounting in the same commit do not both hit the network. It is
 * NOT a store: nothing is revalidated in the background and nothing is kept
 * beyond the window.
 */
interface CacheEntry<T> {
  at: number;
  value: FetchResult<T>;
}

const inFlight = new Map<string, Promise<FetchResult<unknown>>>();
const recent = new Map<string, CacheEntry<unknown>>();

/** How long a completed result is reused. One mount cycle, not a session. */
const DEDUPE_WINDOW_MS = 5_000;

export async function dedupedGetJson<T>(
  path: string,
  options: { force?: boolean; windowMs?: number } = {},
): Promise<FetchResult<T>> {
  const windowMs = options.windowMs ?? DEDUPE_WINDOW_MS;

  if (options.force) {
    recent.delete(path);
    inFlight.delete(path);
  } else {
    const cached = recent.get(path);
    if (cached && Date.now() - cached.at < windowMs) {
      return cached.value as FetchResult<T>;
    }
    const pending = inFlight.get(path);
    if (pending) return pending as Promise<FetchResult<T>>;
  }

  const request = apiGetJson<T>(path)
    .then((result) => {
      // Only a success is worth reusing — caching a failure would make a
      // retry-on-error button do nothing for the length of the window.
      if (result.kind === 'ok') recent.set(path, { at: Date.now(), value: result });
      return result;
    })
    .finally(() => {
      inFlight.delete(path);
    });

  inFlight.set(path, request as Promise<FetchResult<unknown>>);
  return request;
}

/** Drop any cached copy, e.g. after a mutation that invalidates it. */
export function invalidateDedupedGet(path?: string): void {
  if (path) {
    recent.delete(path);
    inFlight.delete(path);
    return;
  }
  recent.clear();
  inFlight.clear();
}

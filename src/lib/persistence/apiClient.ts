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

import 'server-only';
import { logger } from '@/lib/logger';
import { providerErrorFromResponse, withProviderRetry } from './providerError';

/**
 * Bounded provider pagination.
 *
 * ## What was wrong (P1-13)
 *
 * Four separate `while (nextUrl)` / `do…while (pageToken)` loops followed
 * provider pagination with **no ceiling at all**. Whatever the provider says is
 * next, we fetch — forever. A Graph bug that returns a self-referential
 * `@odata.nextLink`, or simply an account with a very large calendar, spins the
 * loop until Vercel kills the function. There is no natural stopping point in
 * the code; the only stopping condition is the provider's honesty.
 *
 * Three of those four loops also used a bare `fetch`:
 *
 * - **no `signal`** — a hung provider pinned the request until the platform
 *   timeout, with a thread and a DB connection held open the whole time;
 * - **no retry** — a single 429 on page 7 of 12 threw away the six pages
 *   already fetched and failed the whole calendar;
 * - **a generic `Error`** — so `isFatalProviderError` saw `false`, the caller's
 *   catch-all marked the integration `error`, and, per `providerError.ts`, one
 *   rate-limit blip disconnected the user's calendar until they noticed.
 *
 * And every one of them resolved the access token **once, before the loop**.
 * Microsoft Graph access tokens are short-lived; a long pagination chain can
 * outlive the token it started with, and the failure mode is a 401 on a late
 * page — which `classifyStatus` reads as `reconnect_required`, i.e. "your
 * account is disconnected", for a user whose account is perfectly fine.
 *
 * This module is the one place that gets all four right.
 */

/**
 * Page ceiling. At the `$top`/`maxResults` of 250 used everywhere, 40 pages is
 * 10,000 events from a single calendar in a single window — comfortably beyond
 * any real calendar, and low enough to bound the worst case.
 */
export const MAX_PROVIDER_PAGES = 40;

/**
 * Re-resolve the access token this often. `getMicrosoftAccessToken` /
 * `getGoogleAccessToken` refresh on expiry and are cheap when the cached token
 * is still valid, so this is a bounded read, not a refresh per N pages.
 */
export const TOKEN_REFRESH_EVERY_PAGES = 10;

/** Per-request ceiling. The token endpoints already used 10s; data calls used none. */
export const PROVIDER_FETCH_TIMEOUT_MS = 15_000;

export interface PaginatedFetchOptions<TItem> {
  /** `'google'` | `'microsoft'` — used for error classification and logs. */
  provider: string;
  /** Short, non-sensitive description of the call, for logs and error messages. */
  context: string;
  /** Absolute URL of the first page. */
  firstUrl: string;
  /** Resolves (and refreshes, if needed) the bearer token. Called per token window. */
  resolveToken: () => Promise<string>;
  /** Extra request headers. `Authorization` and `Accept` are supplied. */
  headers?: Record<string, string>;
  /** Pull the items and the next-page URL out of one decoded page. */
  readPage: (json: unknown) => { items: TItem[]; nextUrl: string | null };
  /** Override the page ceiling. Defaults to {@link MAX_PROVIDER_PAGES}. */
  maxPages?: number;
}

/**
 * Follow a provider's `nextLink`-style pagination with a hard page ceiling,
 * a per-request timeout, bounded retry on transient failures, and periodic
 * token re-resolution.
 *
 * Returns everything fetched. Hitting the ceiling is **not** an error — a
 * truncated read of a huge calendar beats a killed function — but it is logged
 * at `warn` so it is visible rather than silent.
 */
export async function fetchAllPages<TItem>(
  options: PaginatedFetchOptions<TItem>,
): Promise<TItem[]> {
  const { provider, context, firstUrl, resolveToken, readPage } = options;
  const maxPages = options.maxPages ?? MAX_PROVIDER_PAGES;

  const items: TItem[] = [];
  let nextUrl: string | null = firstUrl;
  let token = await resolveToken();
  let page = 0;

  while (nextUrl !== null && page < maxPages) {
    // Re-resolve on a page boundary rather than mid-chain, so a refresh never
    // races a request already in flight.
    if (page > 0 && page % TOKEN_REFRESH_EVERY_PAGES === 0) {
      token = await resolveToken();
    }

    const url: string = nextUrl;
    const json = await withProviderRetry(async () => {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...options.headers,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw providerErrorFromResponse(provider, res, body, context);
      }

      return res.json() as Promise<unknown>;
    });

    const { items: pageItems, nextUrl: following } = readPage(json);
    items.push(...pageItems);

    // A provider that returns the page it was just asked for is the exact shape
    // that made the old unbounded loop dangerous. Stop rather than spin.
    nextUrl = following === url ? null : following;
    page += 1;
  }

  if (nextUrl !== null) {
    logger.warn('provider pagination ceiling reached', {
      provider,
      context,
      pages: page,
      items: items.length,
    });
  }

  return items;
}

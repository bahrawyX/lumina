/**
 * P1-13 — provider pagination was unbounded, untimed, unretried, and ran on a
 * token resolved once before the loop.
 *
 * Every case here fails against the previous implementation:
 *  - "stops at the ceiling" hangs forever (the old `while (nextUrl)` never exits);
 *  - "re-resolves the token" sees one call instead of two;
 *  - "retries a 429" throws instead of returning;
 *  - "does not retry a 401" would have retried a dead credential;
 *  - "passes an abort signal" sees `signal: undefined`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAllPages,
  MAX_PROVIDER_PAGES,
  TOKEN_REFRESH_EVERY_PAGES,
  PROVIDER_FETCH_TIMEOUT_MS,
} from '@/lib/integrations/pagination';
import { ProviderError } from '@/lib/integrations/providerError';

const NEXT = '@odata.nextLink';

/** A Graph-shaped page. `next` of `null` ends the chain. */
function page(items: unknown[], next: string | null) {
  return new Response(JSON.stringify(next ? { value: items, [NEXT]: next } : { value: items }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function failure(status: number, headers: Record<string, string> = {}) {
  return new Response('provider said no', { status, headers });
}

const readPage = (json: unknown) => {
  const p = json as { value?: number[]; '@odata.nextLink'?: string };
  return { items: p.value ?? [], nextUrl: p[NEXT] ?? null };
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type Options = Parameters<typeof fetchAllPages<number>>[0];

const run = (over: Partial<Options> = {}) =>
  fetchAllPages<number>({
    provider: 'microsoft',
    context: '/me/calendars/x/calendarView',
    firstUrl: 'https://graph.microsoft.com/v1.0/page/0',
    resolveToken: async () => 'token-0',
    readPage,
    ...over,
  });

describe('fetchAllPages — the page ceiling', () => {
  it('stops at MAX_PROVIDER_PAGES instead of following forever', async () => {
    // The old loop had NO exit condition other than the provider's honesty.
    // This mock never stops offering a next page, so the old code hangs until
    // the platform kills the function.
    let n = 0;
    fetchMock.mockImplementation(() => {
      n += 1;
      return Promise.resolve(page([n], `https://graph.microsoft.com/v1.0/page/${n}`));
    });

    const items = await run();

    expect(fetchMock).toHaveBeenCalledTimes(MAX_PROVIDER_PAGES);
    expect(items).toHaveLength(MAX_PROVIDER_PAGES);
    // Truncation is deliberate: a partial read beats a killed function.
    expect(items[0]).toBe(1);
  });

  it('returns early when the provider stops offering pages', async () => {
    fetchMock
      .mockResolvedValueOnce(page([1, 2], 'https://graph.microsoft.com/v1.0/page/1'))
      .mockResolvedValueOnce(page([3], null));

    await expect(run()).resolves.toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('breaks a self-referential nextLink rather than spinning on it', async () => {
    // A provider that hands back the URL it was just called with is the exact
    // shape that makes an unbounded loop dangerous.
    const self = 'https://graph.microsoft.com/v1.0/page/0';
    fetchMock.mockResolvedValue(page([7], self));

    await expect(run({ firstUrl: self })).resolves.toEqual([7]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit lower ceiling', async () => {
    let n = 0;
    fetchMock.mockImplementation(() => {
      n += 1;
      return Promise.resolve(page([n], `https://graph.microsoft.com/v1.0/page/${n}`));
    });

    await expect(run({ maxPages: 3 })).resolves.toEqual([1, 2, 3]);
  });
});

describe('fetchAllPages — the access token', () => {
  it('re-resolves on a page boundary, so a long chain cannot outlive its token', async () => {
    // Graph access tokens are short-lived. A token resolved once before the
    // loop 401s on a late page, and `classifyStatus` reads 401 as
    // `reconnect_required` — telling a user with a healthy account that they
    // have been disconnected.
    let issued = 0;
    const resolveToken = vi.fn(async () => {
      issued += 1;
      return `token-${issued}`;
    });
    let n = 0;
    fetchMock.mockImplementation(() => {
      n += 1;
      const last = n >= TOKEN_REFRESH_EVERY_PAGES + 1;
      return Promise.resolve(page([n], last ? null : `https://graph.microsoft.com/v1.0/page/${n}`));
    });

    await run({ resolveToken });

    // Once up front, once when crossing the boundary.
    expect(resolveToken).toHaveBeenCalledTimes(2);
    const used = fetchMock.mock.calls.map((c) => c[1].headers.Authorization);
    expect(used[0]).toBe('Bearer token-1');
    expect(used[TOKEN_REFRESH_EVERY_PAGES]).toBe('Bearer token-2');
  });

  it('resolves exactly once for a short chain', async () => {
    const resolveToken = vi.fn(async () => 'token-0');
    fetchMock.mockResolvedValueOnce(page([1], null));

    await run({ resolveToken });

    expect(resolveToken).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAllPages — failures', () => {
  it('passes a bounded abort signal, so a hung provider cannot pin the function', async () => {
    fetchMock.mockResolvedValueOnce(page([1], null));
    const spy = vi.spyOn(AbortSignal, 'timeout');

    await run();

    expect(spy).toHaveBeenCalledWith(PROVIDER_FETCH_TIMEOUT_MS);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    spy.mockRestore();
  });

  it('retries a 429 and keeps the pages already fetched', async () => {
    // A single 429 on page 2 used to throw away page 1 and fail the calendar.
    fetchMock
      .mockResolvedValueOnce(page([1], 'https://graph.microsoft.com/v1.0/page/1'))
      .mockResolvedValueOnce(failure(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(page([2], null));

    await expect(run()).resolves.toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 401 — retrying a dead credential cannot help', async () => {
    fetchMock.mockResolvedValue(failure(401));

    await expect(run()).rejects.toMatchObject({ kind: 'reconnect_required' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a classified ProviderError, not a generic Error', async () => {
    // The old loops threw `new Error('[microsoft/client] Graph API 503: …')`.
    // `isFatalProviderError` saw `false`, but the caller's catch-all marked the
    // integration dead anyway — so a transient blip disconnected the calendar.
    fetchMock.mockResolvedValue(failure(503, { 'retry-after': '0' }));

    const err = await run().catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_unavailable');
    expect(err.isFatal).toBe(false);
  });

  it('keeps the provider body out of the thrown message (P3-3)', async () => {
    fetchMock.mockResolvedValue(failure(500, { 'retry-after': '0' }));

    const err = await run().catch((e) => e);
    expect(err.message).not.toContain('provider said no');
    expect(err.message).toContain('/me/calendars/x/calendarView');
  });

  it('merges caller headers without letting them drop Authorization', async () => {
    fetchMock.mockResolvedValueOnce(page([1], null));

    await run({ headers: { Prefer: 'outlook.timezone="UTC"' } });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Prefer).toBe('outlook.timezone="UTC"');
    expect(headers.Authorization).toBe('Bearer token-0');
  });
});

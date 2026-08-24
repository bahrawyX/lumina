import 'server-only';
import { getGoogleAccessToken } from './token';
import { providerErrorFromResponse, withProviderRetry } from '../providerError';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/**
 * Server-only Google Calendar API fetch helper.
 * Handles token injection, query params, and error surfacing.
 * Never call from client components.
 */
export async function googleFetch<T = unknown>(
  userId: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const accessToken = await getGoogleAccessToken(userId);

  const url = new URL(`${GOOGLE_CALENDAR_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  // P1-13: every provider fetch omitted `signal`, so a hung provider pinned the
  // function until Vercel killed it. The TOKEN refresh calls already used
  // AbortSignal.timeout(10_000); the data calls did not.
  //
  // P1-12: a non-2xx used to throw a generic Error that nothing inspected, so a
  // 429 and a revoked grant were indistinguishable. `providerErrorFromResponse`
  // classifies the status, and `withProviderRetry` retries only the transient
  // kinds, honouring Retry-After.
  return withProviderRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      // Prevent Next.js from caching — always fetch fresh data
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw providerErrorFromResponse('google', res, body, path);
    }

    return res.json() as Promise<T>;
  });
}

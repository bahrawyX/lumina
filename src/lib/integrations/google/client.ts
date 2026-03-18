import 'server-only';
import { getGoogleAccessToken } from './token';

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

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    // Prevent Next.js from caching — always fetch fresh data
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[google/client] API ${res.status} at ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

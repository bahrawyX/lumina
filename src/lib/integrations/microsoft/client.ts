import 'server-only';
import { getMicrosoftAccessToken } from './token';

export const GRAPH_API = 'https://graph.microsoft.com/v1.0';

/**
 * Authenticated fetch against Microsoft Graph API.
 * Resolves a valid access token from the DB (refreshing if expired).
 * Follows @odata.nextLink only when the caller handles pagination itself;
 * use graphFetchAll for automatic pagination.
 */
export async function graphFetch<T = unknown>(
  userId: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const accessToken = await getMicrosoftAccessToken(userId);

  const url = new URL(`${GRAPH_API}${path}`);
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
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[microsoft/client] Graph API ${res.status} at ${path}: ${body}`,
    );
  }

  return res.json() as Promise<T>;
}

/**
 * Paginated fetch that follows @odata.nextLink automatically.
 * Returns a flat array of all `value` items across all pages.
 */
export async function graphFetchAll<TItem>(
  userId: string,
  path: string,
  params?: Record<string, string>,
): Promise<TItem[]> {
  const accessToken = await getMicrosoftAccessToken(userId);
  const allItems: TItem[] = [];

  const url = new URL(`${GRAPH_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `[microsoft/client] Graph API ${res.status}: ${body}`,
      );
    }

    const page = (await res.json()) as {
      value?: TItem[];
      '@odata.nextLink'?: string;
    };

    allItems.push(...(page.value ?? []));
    nextUrl = page['@odata.nextLink'] ?? null;
  }

  return allItems;
}

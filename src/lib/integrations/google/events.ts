import 'server-only';
import { googleFetch } from './client';
import { mapGoogleEvent, type GoogleEventsListResponse } from './mapper';

// Initial sync window: 90 days ago → 365 days ahead
function getSyncWindow(): { timeMin: string; timeMax: string } {
  const now = Date.now();
  return {
    timeMin: new Date(now - 90 * 86_400_000).toISOString(),
    timeMax: new Date(now + 365 * 86_400_000).toISOString(),
  };
}

/**
 * Fetch all events from a single Google calendar within the sync window.
 * Handles pagination automatically.
 */
async function fetchGoogleEventsForCalendar(
  userId: string,
  googleCalendarId: string,
): Promise<GoogleEventsListResponse['items']> {
  const { timeMin, timeMax } = getSyncWindow();
  const allItems: GoogleEventsListResponse['items'] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      timeMin,
      timeMax,
      singleEvents: 'true',   // expand recurring events into instances
      orderBy: 'startTime',
      maxResults: '250',
    };
    if (pageToken) params.pageToken = pageToken;

    const page = await googleFetch<GoogleEventsListResponse>(
      userId,
      `/calendars/${encodeURIComponent(googleCalendarId)}/events`,
      params,
    );

    allItems.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return allItems;
}

export interface SyncCalendarEventsResult {
  calendarId: string;
  googleCalendarId: string;
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Sync all events for a single Google calendar into the DB.
 * Returns counts for monitoring.
 */
export async function syncGoogleCalendarEvents(
  userId: string,
  dbCalendarId: string,
  googleCalendarId: string,
): Promise<SyncCalendarEventsResult> {
  const rawItems = await fetchGoogleEventsForCalendar(userId, googleCalendarId);
  const mapped = rawItems.map(mapGoogleEvent);
  const valid = mapped.filter((e) => e !== null);
  const invalidCount = rawItems.length - valid.length;

  return {
    calendarId: dbCalendarId,
    googleCalendarId,
    inserted: 0,
    updated: 0,
    skipped: valid.length + invalidCount,
  };
}

/**
 * Sync events for all Google calendars belonging to the user.
 */
export async function syncAllGoogleCalendarEvents(
  userId: string,
  googleCalendars: Array<{ id: string; externalId: string }>,
): Promise<SyncCalendarEventsResult[]> {
  const results = await Promise.all(
    googleCalendars.map(({ id, externalId }) =>
      syncGoogleCalendarEvents(userId, id, externalId),
    ),
  );
  return results;
}

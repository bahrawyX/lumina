import 'server-only';
import { getMicrosoftAccessToken } from './token';
import { mapMicrosoftEvent, type MicrosoftEvent } from './mapper';
const GRAPH_API = 'https://graph.microsoft.com/v1.0';

function getSyncWindow(): { startDateTime: string; endDateTime: string } {
  const now = Date.now();
  return {
    startDateTime: new Date(now - 30 * 86_400_000).toISOString(),
    endDateTime:   new Date(now + 365 * 86_400_000).toISOString(),
  };
}

/**
 * Fetches all events from a single Microsoft calendar using the calendarView
 * endpoint (handles recurring events correctly). Paginates automatically.
 *
 * Prefer: `Prefer: outlook.timezone="UTC"` so all times arrive in UTC.
 */
async function fetchMicrosoftEventsForCalendar(
  userId: string,
  msCalendarId: string,
): Promise<MicrosoftEvent[]> {
  const token = await getMicrosoftAccessToken(userId);
  const { startDateTime, endDateTime } = getSyncWindow();

  const url = new URL(
    `${GRAPH_API}/me/calendars/${encodeURIComponent(msCalendarId)}/calendarView`,
  );
  url.searchParams.set('startDateTime', startDateTime);
  url.searchParams.set('endDateTime', endDateTime);
  url.searchParams.set(
    '$select',
    'id,subject,start,end,isAllDay,isCancelled,lastModifiedDateTime,changeKey,location,organizer,onlineMeetingUrl,bodyPreview',
  );
  url.searchParams.set('$top', '250');

  const allItems: MicrosoftEvent[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        Prefer: 'outlook.timezone="UTC"',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `[microsoft/events] calendarView ${res.status} for calendar ${msCalendarId}: ${text}`,
      );
    }

    const page = (await res.json()) as {
      value?: MicrosoftEvent[];
      '@odata.nextLink'?: string;
    };

    allItems.push(...(page.value ?? []));
    nextUrl = page['@odata.nextLink'] ?? null;
  }

  return allItems;
}

export interface SyncMicrosoftCalendarEventsResult {
  calendarId: string;
  msCalendarId: string;
  inserted: number;
  updated: number;
  skipped: number;
}

export async function syncMicrosoftCalendarEvents(
  userId: string,
  dbCalendarId: string,
  msCalendarId: string,
): Promise<SyncMicrosoftCalendarEventsResult> {
  const rawItems = await fetchMicrosoftEventsForCalendar(userId, msCalendarId);
  const mapped = rawItems.map(mapMicrosoftEvent);
  const valid = mapped.filter((e) => e !== null);
  const invalidCount = rawItems.length - valid.length;

  return {
    calendarId: dbCalendarId,
    msCalendarId,
    inserted: 0,
    updated: 0,
    skipped: valid.length + invalidCount,
  };
}

export async function syncAllMicrosoftCalendarEvents(
  userId: string,
  msCalendars: Array<{ id: string; externalId: string }>,
): Promise<SyncMicrosoftCalendarEventsResult[]> {
  return Promise.all(
    msCalendars.map(({ id, externalId }) =>
      syncMicrosoftCalendarEvents(userId, id, externalId),
    ),
  );
}

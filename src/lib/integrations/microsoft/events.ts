import 'server-only';
import { getMicrosoftAccessToken } from './token';
import { mapMicrosoftEvent, type MicrosoftEvent } from './mapper';
import { mapWithConcurrency } from '../mapWithConcurrency';
const GRAPH_API = 'https://graph.microsoft.com/v1.0';

// Bound the per-calendar fan-out (TD-5 / #7): a user with many calendars would
// otherwise fire N simultaneous multi-page fetches. 4 keeps it parallel but modest.
const CALENDAR_FETCH_CONCURRENCY = 4;

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

/**
 * INTENTIONAL NO-OP: fetches + counts events but writes NONE to the DB.
 *
 * Lumina uses a browser-cache-only architecture for external (Google/Outlook)
 * events. Do NOT "fix" this by adding a DB write — nothing reads such rows and
 * it re-consumes the exact Neon row quota the cleanup route exists to reclaim:
 *  - GET /api/events returns only provider='local' rows and explicitly excludes
 *    Google/Microsoft events — see src/app/api/events/route.ts.
 *  - POST /api/maintenance/cleanup-external-events deletes any provider rows.
 *  - The calendar reads external events LIVE via /api/external-events/* (see
 *    fetchMicrosoftExternalEvents), cached in the browser — never from this table.
 * Calendar *metadata* is still imported (runFullMicrosoftSync phase 1); only the
 * event write is dropped. The fetch is kept only for skipped-count telemetry;
 * its cost on OAuth connect is tracked separately in the audit doc.
 */
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
  return mapWithConcurrency(
    msCalendars,
    CALENDAR_FETCH_CONCURRENCY,
    ({ id, externalId }) => syncMicrosoftCalendarEvents(userId, id, externalId),
  );
}

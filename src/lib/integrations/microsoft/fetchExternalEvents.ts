import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { getMicrosoftAccessToken } from './token';
import type { MicrosoftEvent } from './mapper';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const SELECT_FIELDS =
  'id,subject,start,end,isAllDay,isCancelled,lastModifiedDateTime,changeKey,location,organizer,onlineMeetingUrl,bodyPreview';

interface MicrosoftCalendarListItem {
  id: string;
}

async function fetchMicrosoftCalendars(token: string): Promise<MicrosoftCalendarListItem[]> {
  const res = await fetch(`${GRAPH_API}/me/calendars`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Prefer: 'outlook.timezone="Africa/Cairo"',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[microsoft/fetchCalendars] ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { value?: MicrosoftCalendarListItem[] };
  return data.value ?? [];
}

async function fetchCalendarView(
  token: string,
  calendarViewPath: string,
  color: string,
  startIso: string,
  endIso: string,
): Promise<ApiExternalEvent[]> {
  const startDateTime = new Date(startIso).toISOString();
  const endDateTime = new Date(endIso).toISOString();

  const url = new URL(`${GRAPH_API}${calendarViewPath}`);
  url.searchParams.set('startDateTime', startDateTime);
  url.searchParams.set('endDateTime', endDateTime);
  url.searchParams.set('$select', SELECT_FIELDS);
  url.searchParams.set('$top', '250');

  const allItems: ApiExternalEvent[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        Prefer: 'outlook.timezone="Africa/Cairo"',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`[microsoft/fetchExternal] ${res.status}: ${text}`);
    }

    const page = (await res.json()) as {
      value?: MicrosoftEvent[];
      '@odata.nextLink'?: string;
    };

    const pageEvents = page.value ?? [];

    for (const event of pageEvents) {
      allItems.push({
        externalEventId: event.id ?? '',
        provider: 'microsoft',
        title: event.subject || '(No Subject)',
        description: event.bodyPreview ?? null,
        startIso: event.start?.dateTime ?? '',
        endIso: event.end?.dateTime ?? '',
        isAllDay: Boolean(event.isAllDay),
        timezone: event.start?.timeZone || 'Africa/Cairo',
        location: event.location?.displayName || null,
        color,
        organizerEmail: event.organizer?.emailAddress?.address || null,
        meetingUrl: event.onlineMeetingUrl ?? null,
      });
    }

    nextUrl = page['@odata.nextLink'] ?? null;
  }

  return allItems;
}

/**
 * Fetches Microsoft Calendar events for all of the user's connected Outlook
 * calendars and returns them as normalized ApiExternalEvent objects.
 *
 * IMPORTANT: This function does NOT write anything to the database.
 * Events are returned as payloads to be cached in the browser.
 */
export async function fetchMicrosoftExternalEvents(
  userId: string,
  startIso: string,
  endIso: string,
  selectedCalendarIds?: string[],
): Promise<ApiExternalEvent[]> {
  const token = await getMicrosoftAccessToken(userId);
  console.log('MICROSOFT ACCESS TOKEN', token);
  const db = getDatabase();

  const msCals = await db
    .select({ id: calendars.id, externalId: calendars.externalId, color: calendars.color })
    .from(calendars)
    .where(
      selectedCalendarIds
        ? and(
            eq(calendars.userId, userId),
            eq(calendars.provider, 'microsoft'),
            inArray(calendars.id, selectedCalendarIds),
          )
        : and(
            eq(calendars.userId, userId),
            eq(calendars.provider, 'microsoft'),
          ),
    );

  const validMsCals = msCals.filter((c) => c.externalId !== null);

  if (msCals.length === 0 || validMsCals.length === 0) {
    const calendarsFromGraph = await fetchMicrosoftCalendars(token);
    if (calendarsFromGraph.length === 0) {
      return [];
    }

    const settledAllCalendars = await Promise.all(
      calendarsFromGraph.map(async (calendar) => {
        try {
          return await fetchCalendarView(
            token,
            `/me/calendars/${encodeURIComponent(calendar.id)}/calendarView`,
            '#0078D4',
            startIso,
            endIso,
          );
        } catch {
          return [] as ApiExternalEvent[];
        }
      }),
    );

    const allEvents = settledAllCalendars.flatMap((events) => events || []);
    return allEvents;
  }

  const settled = await Promise.allSettled(
    validMsCals.map((c) =>
        fetchCalendarView(
          token,
          `/me/calendars/${encodeURIComponent(c.externalId!)}/calendarView`,
          c.color ?? '#0078D4',
          startIso,
          endIso,
        ),
      ),
  );

  const allEvents = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return allEvents;
}

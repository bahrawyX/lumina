import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { getMicrosoftAccessToken } from './token';
import { mapMicrosoftEvent, type MicrosoftEvent } from './mapper';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const SELECT_FIELDS =
  'id,subject,start,end,isAllDay,isCancelled,lastModifiedDateTime,changeKey,location,organizer,onlineMeetingUrl,bodyPreview';

async function fetchCalendarView(
  token: string,
  calendarViewPath: string,
  color: string,
  startIso: string,
  endIso: string,
): Promise<ApiExternalEvent[]> {
  const url = new URL(`${GRAPH_API}${calendarViewPath}`);
  url.searchParams.set('startDateTime', startIso);
  url.searchParams.set('endDateTime', endIso);
  url.searchParams.set('$select', SELECT_FIELDS);
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
      throw new Error(`[microsoft/fetchExternal] ${res.status}: ${text}`);
    }

    const page = (await res.json()) as {
      value?: MicrosoftEvent[];
      '@odata.nextLink'?: string;
    };

    allItems.push(...(page.value ?? []));
    nextUrl = page['@odata.nextLink'] ?? null;
  }

  return allItems
    .map(mapMicrosoftEvent)
    .filter((e): e is NonNullable<ReturnType<typeof mapMicrosoftEvent>> => e !== null)
    .map((e) => ({
      externalEventId: e.externalEventId,
      provider:        'microsoft' as const,
      title:           e.title,
      description:     e.description,
      startIso:        e.startTime.toISOString(),
      endIso:          e.endTime.toISOString(),
      isAllDay:        e.isAllDay,
      timezone:        e.timezone,
      location:        e.location,
      color,
      organizerEmail:  e.organizerEmail,
      meetingUrl:      e.meetingUrl,
    }));
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
): Promise<ApiExternalEvent[]> {
  const token = await getMicrosoftAccessToken(userId);
  const db = getDatabase();

  const msCals = await db
    .select({ externalId: calendars.externalId, color: calendars.color })
    .from(calendars)
    .where(
      and(eq(calendars.userId, userId), eq(calendars.provider, 'microsoft')),
    );

  if (msCals.length === 0) {
    // No imported calendar metadata yet — fetch from the default calendar view
    return fetchCalendarView(
      token,
      '/me/calendarView',
      '#0078D4',
      startIso,
      endIso,
    ).catch(() => []);
  }

  const settled = await Promise.allSettled(
    msCals
      .filter((c) => c.externalId !== null)
      .map((c) =>
        fetchCalendarView(
          token,
          `/me/calendars/${encodeURIComponent(c.externalId!)}/calendarView`,
          c.color ?? '#0078D4',
          startIso,
          endIso,
        ),
      ),
  );

  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

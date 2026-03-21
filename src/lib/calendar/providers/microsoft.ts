import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { getMicrosoftAccessToken } from '@/lib/integrations/microsoft/token';
import type { MicrosoftEvent } from '@/lib/integrations/microsoft/mapper';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const SELECT_FIELDS =
  'id,subject,start,end,isAllDay,isCancelled,lastModifiedDateTime,changeKey,location,organizer,onlineMeetingUrl,bodyPreview';

interface MicrosoftCalendarListItem {
  id: string;
}

export interface MicrosoftRawEventWithColor {
  event: MicrosoftEvent;
  color: string;
}

async function fetchCalendarViewRaw(
  token: string,
  calendarViewPath: string,
  startIso: string,
  endIso: string,
): Promise<MicrosoftEvent[]> {
  const url = new URL(`${GRAPH_API}${calendarViewPath}`);
  url.searchParams.set('startDateTime', new Date(startIso).toISOString());
  url.searchParams.set('endDateTime', new Date(endIso).toISOString());
  url.searchParams.set('$select', SELECT_FIELDS);
  url.searchParams.set('$top', '250');

  const allItems: MicrosoftEvent[] = [];
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
      throw new Error(`[microsoft/provider] ${res.status}: ${text}`);
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
    throw new Error(`[microsoft/calendars] ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { value?: MicrosoftCalendarListItem[] };
  return data.value ?? [];
}

export async function fetchMicrosoftProviderEvents(
  userId: string,
  startIso: string,
  endIso: string,
  selectedCalendarIds?: string[],
): Promise<MicrosoftRawEventWithColor[]> {
  const token = await getMicrosoftAccessToken(userId);
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
        : and(eq(calendars.userId, userId), eq(calendars.provider, 'microsoft')),
    );

  const validMsCals = msCals.filter((c) => c.externalId !== null);

  if (msCals.length === 0 || validMsCals.length === 0) {
    const calendarsFromGraph = await fetchMicrosoftCalendars(token);
    if (calendarsFromGraph.length === 0) return [];

    const all = await Promise.all(
      calendarsFromGraph.map(async (calendar) => {
        try {
          const events = await fetchCalendarViewRaw(
            token,
            `/me/calendars/${encodeURIComponent(calendar.id)}/calendarView`,
            startIso,
            endIso,
          );
          return events.map((event) => ({ event, color: '#0078D4' }));
        } catch {
          return [] as MicrosoftRawEventWithColor[];
        }
      }),
    );

    return all.flatMap((events) => events);
  }

  const settled = await Promise.allSettled(
    validMsCals.map(async (c) => {
      const events = await fetchCalendarViewRaw(
        token,
        `/me/calendars/${encodeURIComponent(c.externalId!)}/calendarView`,
        startIso,
        endIso,
      );
      return events.map((event) => ({ event, color: c.color ?? '#0078D4' }));
    }),
  );

  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

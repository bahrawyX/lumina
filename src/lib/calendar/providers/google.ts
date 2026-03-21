import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { googleFetch } from '@/lib/integrations/google/client';
import type { GoogleEvent, GoogleEventsListResponse } from '@/lib/integrations/google/mapper';

export interface GoogleRawEventWithColor {
  event: GoogleEvent;
  color: string;
}

async function fetchGoogleCalendarEvents(
  userId: string,
  googleCalendarId: string,
  startIso: string,
  endIso: string,
): Promise<GoogleEvent[]> {
  const allItems: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      timeMin: startIso,
      timeMax: endIso,
      singleEvents: 'true',
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

export async function fetchGoogleProviderEvents(
  userId: string,
  startIso: string,
  endIso: string,
  selectedCalendarIds?: string[],
): Promise<GoogleRawEventWithColor[]> {
  if (selectedCalendarIds && selectedCalendarIds.length === 0) {
    return [];
  }

  const db = getDatabase();
  const googleCals = await db
    .select({ id: calendars.id, externalId: calendars.externalId, color: calendars.color })
    .from(calendars)
    .where(
      selectedCalendarIds
        ? and(
            eq(calendars.userId, userId),
            eq(calendars.provider, 'google'),
            inArray(calendars.id, selectedCalendarIds),
          )
        : and(eq(calendars.userId, userId), eq(calendars.provider, 'google')),
    );

  if (googleCals.length === 0) {
    if (selectedCalendarIds) return [];

    const fallbackEvents = await fetchGoogleCalendarEvents(
      userId,
      'primary',
      startIso,
      endIso,
    ).catch(() => []);

    return fallbackEvents.map((event) => ({ event, color: '#4285F4' }));
  }

  const settled = await Promise.allSettled(
    googleCals
      .filter((c) => c.externalId !== null)
      .map(async (c) => {
        const events = await fetchGoogleCalendarEvents(
          userId,
          c.externalId!,
          startIso,
          endIso,
        );
        return events.map((event) => ({ event, color: c.color ?? '#4285F4' }));
      }),
  );

  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

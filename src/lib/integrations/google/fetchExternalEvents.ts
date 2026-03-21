import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { googleFetch } from './client';
import { mapGoogleEvent, type GoogleEventsListResponse } from './mapper';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';

async function fetchCalendarEvents(
  userId: string,
  googleCalendarId: string,
  color: string,
  startIso: string,
  endIso: string,
): Promise<ApiExternalEvent[]> {
  const allItems: ReturnType<typeof mapGoogleEvent>[] = [];
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

    for (const item of page.items ?? []) {
      allItems.push(mapGoogleEvent(item));
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return allItems
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => ({
      externalEventId: e.externalEventId,
      provider: 'google' as const,
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
 * Fetches Google Calendar events for all of the user's connected Google
 * calendars and returns them as normalized ApiExternalEvent objects.
 *
 * IMPORTANT: This function does NOT write anything to the database.
 * Events are returned as payloads to be cached in the browser.
 */
export async function fetchGoogleExternalEvents(
  userId: string,
  startIso: string,
  endIso: string,
  selectedCalendarIds?: string[],
): Promise<ApiExternalEvent[]> {
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
        : and(
            eq(calendars.userId, userId),
            eq(calendars.provider, 'google'),
          ),
    );

  if (googleCals.length === 0) {
    if (selectedCalendarIds) {
      // All selected calendars were disabled/invalid or no calendar is enabled.
      return [];
    }

    // Backward-compatible fallback for older callers that don't pass calendar IDs.
    return fetchCalendarEvents(
      userId,
      'primary',
      '#4285F4',
      startIso,
      endIso,
    ).catch(() => []);
  }

  const settled = await Promise.allSettled(
    googleCals
      .filter((c) => c.externalId !== null)
      .map((c) =>
        fetchCalendarEvents(
          userId,
          c.externalId!,
          c.color ?? '#4285F4',
          startIso,
          endIso,
        ),
      ),
  );

  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

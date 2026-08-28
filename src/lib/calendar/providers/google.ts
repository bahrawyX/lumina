import 'server-only';
import { logger } from '@/lib/logger';
import { mapWithConcurrency } from '@/lib/integrations/mapWithConcurrency';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { googleFetch } from '@/lib/integrations/google/client';
import { MAX_PROVIDER_PAGES } from '@/lib/integrations/pagination';
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
  let pages = 0;

  // P1-13: the live-read loop, bounded like the sync one. `googleFetch` brings
  // the timeout, the retry and a fresh token per call; the ceiling is what was
  // missing.
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
    pages += 1;
  } while (pageToken && pages < MAX_PROVIDER_PAGES);

  if (pageToken) {
    logger.warn('provider pagination ceiling reached', {
      provider: 'google',
      context: `events for calendar ${googleCalendarId}`,
      pages,
      items: allItems.length,
    });
  }

  return allItems;
}

/**
 * P1-13: this returned a bare array, so a per-calendar failure was
 * indistinguishable from "that calendar is empty".
 *
 * `failedCalendarIds` is what lets a caller say "some calendars couldn't be
 * loaded" instead of silently rendering a day with a meeting missing from it.
 */
export interface ProviderEventsResult<T> {
  events: T[];
  /** Calendars whose fetch rejected. Empty on a fully successful read. */
  failedCalendarIds: string[];
}

/**
 * Fan-out ceiling. `mapWithConcurrency` already existed and was tested, but was
 * wired only to two functions whose own doc comments declare them "INTENTIONAL
 * NO-OP" — so the path that actually serves the calendar used a bare
 * `Promise.allSettled` over EVERY calendar. A user with 30 calendars fired 30
 * simultaneous multi-page fetch chains on every calendar view.
 */
export const CALENDAR_FETCH_CONCURRENCY = 4;

export async function fetchGoogleProviderEvents(
  userId: string,
  startIso: string,
  endIso: string,
  selectedCalendarIds?: string[],
): Promise<ProviderEventsResult<GoogleRawEventWithColor>> {
  if (selectedCalendarIds && selectedCalendarIds.length === 0) {
    return { events: [], failedCalendarIds: [] };
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
    if (selectedCalendarIds) return { events: [], failedCalendarIds: [] };

    let failed = false;
    const fallbackEvents = await fetchGoogleCalendarEvents(
      userId,
      'primary',
      startIso,
      endIso,
    ).catch((err) => {
      failed = true;
      logger.error('provider fetch failed', { provider: 'google', calendarId: 'primary' }, err);
      return [];
    });

    return {
      events: fallbackEvents.map((event) => ({ event, color: '#4285F4' })),
      failedCalendarIds: failed ? ['primary'] : [],
    };
  }

  const usable = googleCals.filter((c) => c.externalId !== null);
  const failedCalendarIds: string[] = [];

  const perCalendar = await mapWithConcurrency(
    usable,
    CALENDAR_FETCH_CONCURRENCY,
    async (c) => {
      try {
        const events = await fetchGoogleCalendarEvents(
          userId,
          c.externalId!,
          startIso,
          endIso,
        );
        return events.map((event) => ({ event, color: c.color ?? '#4285F4' }));
      } catch (err) {
        // P1-13: rejections used to be dropped by
        // `r.status === 'fulfilled' ? r.value : []` with no logging and no
        // flag, so one calendar 401-ing meant those events silently
        // disappeared while the UI reported success.
        failedCalendarIds.push(c.id);
        logger.error('provider fetch failed', { provider: 'google', calendarId: c.id }, err);
        return [] as GoogleRawEventWithColor[];
      }
    },
  );

  return { events: perCalendar.flat(), failedCalendarIds };
}

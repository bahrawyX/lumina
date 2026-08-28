import 'server-only';
import { logger } from '@/lib/logger';
import { mapWithConcurrency } from '@/lib/integrations/mapWithConcurrency';
import {
  type ProviderEventsResult,
  CALENDAR_FETCH_CONCURRENCY,
} from './google';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { getMicrosoftAccessToken } from '@/lib/integrations/microsoft/token';
import { fetchAllPages } from '@/lib/integrations/pagination';
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

/**
 * P1-13: this took a pre-resolved `token` and followed `@odata.nextLink`
 * forever with a bare `fetch` — no ceiling, no timeout, no retry, and a generic
 * `Error` that `isFatalProviderError` read as non-fatal while the caller's
 * catch-all marked the integration dead anyway.
 *
 * It now takes `userId` so `fetchAllPages` can re-resolve the token on a page
 * boundary: a live read of a busy calendar can outlive the token it started
 * with, and that 401 was being reported to the user as "reconnect your
 * account".
 */
async function fetchCalendarViewRaw(
  userId: string,
  calendarViewPath: string,
  startIso: string,
  endIso: string,
): Promise<MicrosoftEvent[]> {
  const url = new URL(`${GRAPH_API}${calendarViewPath}`);
  url.searchParams.set('startDateTime', new Date(startIso).toISOString());
  url.searchParams.set('endDateTime', new Date(endIso).toISOString());
  url.searchParams.set('$select', SELECT_FIELDS);
  url.searchParams.set('$top', '250');

  return fetchAllPages<MicrosoftEvent>({
    provider: 'microsoft',
    context: calendarViewPath,
    firstUrl: url.toString(),
    resolveToken: () => getMicrosoftAccessToken(userId),
    // H7: request UTC (matches the sync path) — never a hardcoded region.
    // Graph then returns offset-less UTC wall-clock, which the mapper parses
    // as UTC; the client renders each instant in the viewer's local tz.
    headers: { Prefer: 'outlook.timezone="UTC"' },
    readPage: (json) => {
      const page = json as { value?: MicrosoftEvent[]; '@odata.nextLink'?: string };
      return { items: page.value ?? [], nextUrl: page['@odata.nextLink'] ?? null };
    },
  });
}

async function fetchMicrosoftCalendars(userId: string): Promise<MicrosoftCalendarListItem[]> {
  // Single page by construction, but it shares the timeout/retry/classification
  // the rest of the module now has.
  return fetchAllPages<MicrosoftCalendarListItem>({
    provider: 'microsoft',
    context: '/me/calendars',
    firstUrl: `${GRAPH_API}/me/calendars`,
    resolveToken: () => getMicrosoftAccessToken(userId),
    // H7: no hardcoded region (calendar list carries no datetimes anyway).
    headers: { Prefer: 'outlook.timezone="UTC"' },
    readPage: (json) => {
      const page = json as {
        value?: MicrosoftCalendarListItem[];
        '@odata.nextLink'?: string;
      };
      return { items: page.value ?? [], nextUrl: page['@odata.nextLink'] ?? null };
    },
  });
}

export async function fetchMicrosoftProviderEvents(
  userId: string,
  startIso: string,
  endIso: string,
  selectedCalendarIds?: string[],
): Promise<ProviderEventsResult<MicrosoftRawEventWithColor>> {
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
    const calendarsFromGraph = await fetchMicrosoftCalendars(userId);
    if (calendarsFromGraph.length === 0) return { events: [], failedCalendarIds: [] };

    const discoveredFailures: string[] = [];
    const all = await mapWithConcurrency(
      calendarsFromGraph,
      CALENDAR_FETCH_CONCURRENCY,
      async (calendar) => {
        try {
          const events = await fetchCalendarViewRaw(
            userId,
            `/me/calendars/${encodeURIComponent(calendar.id)}/calendarView`,
            startIso,
            endIso,
          );
          return events.map((event) => ({ event, color: '#0078D4' }));
        } catch (err) {
          // This branch swallowed errors with a bare `catch {}` — the same
          // silent-loss shape as the main path below.
          discoveredFailures.push(calendar.id);
          logger.error(
            'provider fetch failed',
            { provider: 'microsoft', calendarId: calendar.id },
            err,
          );
          return [] as MicrosoftRawEventWithColor[];
        }
      },
    );

    return { events: all.flat(), failedCalendarIds: discoveredFailures };
  }

  const failedCalendarIds: string[] = [];

  const perCalendar = await mapWithConcurrency(
    validMsCals,
    CALENDAR_FETCH_CONCURRENCY,
    async (c) => {
      try {
        const events = await fetchCalendarViewRaw(
          userId,
          `/me/calendars/${encodeURIComponent(c.externalId!)}/calendarView`,
          startIso,
          endIso,
        );
        return events.map((event) => ({ event, color: c.color ?? '#0078D4' }));
      } catch (err) {
        // P1-13 — see the Google provider.
        failedCalendarIds.push(c.id);
        logger.error('provider fetch failed', { provider: 'microsoft', calendarId: c.id }, err);
        return [] as MicrosoftRawEventWithColor[];
      }
    },
  );

  return { events: perCalendar.flat(), failedCalendarIds };
}

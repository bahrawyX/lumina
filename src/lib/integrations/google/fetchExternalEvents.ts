import 'server-only';
import { fetchGoogleProviderEvents } from '@/lib/calendar/providers/google';
import { normalizeExternalEvents } from '@/lib/calendar/normalize';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';

/**
 * P1-13: a partial read has to stay distinguishable from an empty one all the
 * way up to the route, or the UI renders a day with a meeting missing from it
 * and calls that success.
 */
export interface ExternalEventsResult {
  events: ApiExternalEvent[];
  /** Calendars whose fetch failed. Empty on a fully successful read. */
  failedCalendarIds: string[];
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
): Promise<ExternalEventsResult> {
  const { events, failedCalendarIds } = await fetchGoogleProviderEvents(
    userId,
    startIso,
    endIso,
    selectedCalendarIds,
  );

  return {
    events: normalizeExternalEvents('google', events),
    failedCalendarIds,
  };
}

import 'server-only';
import { fetchGoogleProviderEvents } from '@/lib/calendar/providers/google';
import { normalizeExternalEvents } from '@/lib/calendar/normalize';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';

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
  const rawEvents = await fetchGoogleProviderEvents(
    userId,
    startIso,
    endIso,
    selectedCalendarIds,
  );

  return normalizeExternalEvents('google', rawEvents);
}

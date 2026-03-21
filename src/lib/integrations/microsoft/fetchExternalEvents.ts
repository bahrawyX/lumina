import 'server-only';
import { fetchMicrosoftProviderEvents } from '@/lib/calendar/providers/microsoft';
import { normalizeExternalEvents } from '@/lib/calendar/normalize';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';

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
  const rawEvents = await fetchMicrosoftProviderEvents(
    userId,
    startIso,
    endIso,
    selectedCalendarIds,
  );

  return normalizeExternalEvents('microsoft', rawEvents);
}

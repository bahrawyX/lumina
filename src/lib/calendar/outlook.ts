import type { CalendarProvider, CalendarProviderEvent } from "./types";

/**
 * OutlookCalendarProvider — syncs events via Microsoft Graph API.
 * Uses access tokens supplied by the server-side integration OAuth flow
 * (/api/integrations/microsoft/connect → callback → integrations table).
 */
export class OutlookCalendarProvider implements CalendarProvider {
  readonly name = "outlook" as const;

  async fetchEvents(
    _userId: string,
    _rangeStart: Date,
    _rangeEnd: Date
  ): Promise<CalendarProviderEvent[]> {
    // Server-side token retrieval is handled by /api/sync/outlook.
    // This client-side provider is a no-op; callers should use the API route.
    return [];
  }

  async createEvent(
    _userId: string,
    _event: Omit<CalendarProviderEvent, "id">
  ): Promise<CalendarProviderEvent> {
    throw new Error("Outlook event creation not yet implemented");
  }

  async updateEvent(
    _userId: string,
    _eventId: string,
    _updates: Partial<CalendarProviderEvent>
  ): Promise<CalendarProviderEvent> {
    throw new Error("Outlook event update not yet implemented");
  }

  async deleteEvent(_userId: string, _eventId: string): Promise<void> {
    throw new Error("Outlook event deletion not yet implemented");
  }
}

import type { CalendarProvider, CalendarProviderEvent } from "./types";

/**
 * GoogleCalendarProvider — syncs events via Google Calendar API.
 * Requires OAuth tokens stored per-user.
 *
 * Implementation placeholder: wire up once Google OAuth is configured.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google" as const;

  async fetchEvents(
    _userId: string,
    _rangeStart: Date,
    _rangeEnd: Date
  ): Promise<CalendarProviderEvent[]> {
    // TODO: implement Google Calendar API fetch
    return [];
  }

  async createEvent(
    _userId: string,
    _event: Omit<CalendarProviderEvent, "id">
  ): Promise<CalendarProviderEvent> {
    throw new Error("Google Calendar event creation not yet implemented");
  }

  async updateEvent(
    _userId: string,
    _eventId: string,
    _updates: Partial<CalendarProviderEvent>
  ): Promise<CalendarProviderEvent> {
    throw new Error("Google Calendar event update not yet implemented");
  }

  async deleteEvent(_userId: string, _eventId: string): Promise<void> {
    throw new Error("Google Calendar event deletion not yet implemented");
  }
}

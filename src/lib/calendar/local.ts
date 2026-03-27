import type { CalendarProvider, CalendarProviderEvent } from "./types";
import { uid } from "../uid";

/**
 * LocalCalendarProvider — reads/writes events from the Zustand store
 * via localStorage. This is the default provider when no external
 * calendar is connected. It operates entirely client-side.
 */
export class LocalCalendarProvider implements CalendarProvider {
  readonly name = "local" as const;

  async fetchEvents(
    _userId: string,
    _rangeStart: Date,
    _rangeEnd: Date
  ): Promise<CalendarProviderEvent[]> {
    // Local events are managed by useCalendarEventsStore on the client.
    // Server-side fetch will be implemented once DB persistence is active.
    return [];
  }

  async createEvent(
    _userId: string,
    event: Omit<CalendarProviderEvent, "id">
  ): Promise<CalendarProviderEvent> {
    const id = uid('ev_');
    return { ...event, id };
  }

  async updateEvent(
    _userId: string,
    eventId: string,
    updates: Partial<CalendarProviderEvent>
  ): Promise<CalendarProviderEvent> {
    return { id: eventId, title: "", start: "", end: "", ...updates } as CalendarProviderEvent;
  }

  async deleteEvent(_userId: string, _eventId: string): Promise<void> {
    // No-op: deletion is handled by the store on the client
  }
}

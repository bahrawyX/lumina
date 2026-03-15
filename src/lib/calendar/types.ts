export interface CalendarProviderEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO 8601
  end: string;   // ISO 8601
  location?: string;
  meetingLink?: string;
  organizer?: string;
  recurrence?: string;
  isAllDay?: boolean;
  providerEventId?: string;
}

export interface CalendarProvider {
  readonly name: "local" | "google" | "outlook";

  fetchEvents(
    userId: string,
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<CalendarProviderEvent[]>;

  createEvent(
    userId: string,
    event: Omit<CalendarProviderEvent, "id">
  ): Promise<CalendarProviderEvent>;

  updateEvent(
    userId: string,
    eventId: string,
    updates: Partial<CalendarProviderEvent>
  ): Promise<CalendarProviderEvent>;

  deleteEvent(userId: string, eventId: string): Promise<void>;
}

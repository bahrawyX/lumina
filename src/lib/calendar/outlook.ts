import type { CalendarProvider, CalendarProviderEvent } from "./types";
import { fetchOutlookEvents, mapOutlookEventToLuminaEvent } from "@/lib/outlook/outlookEvents";
import { acquireToken } from "@/lib/outlook/outlookAuth";

/**
 * OutlookCalendarProvider — syncs events via Microsoft Graph API.
 * Requires MSAL authentication on the client side.
 */
export class OutlookCalendarProvider implements CalendarProvider {
  readonly name = "outlook" as const;

  async fetchEvents(
    _userId: string,
    _rangeStart: Date,
    _rangeEnd: Date
  ): Promise<CalendarProviderEvent[]> {
    const token = await acquireToken();
    if (!token) return [];

    const outlookEvents = await fetchOutlookEvents(token);
    return outlookEvents.map((ev) => {
      const mapped = mapOutlookEventToLuminaEvent(ev, "UTC");
      return {
        id: mapped.id,
        title: mapped.title,
        description: mapped.description,
        start: `${mapped.date}T${mapped.startTime}`,
        end: `${mapped.date}T${mapped.endTime}`,
        location: mapped.location,
        meetingLink: mapped.meetingLink?.url ?? mapped.meetingLink as any as string,
        organizer: mapped.organizer,
        providerEventId: ev.id,
      };
    });
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

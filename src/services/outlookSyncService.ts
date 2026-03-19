import type { CalendarEvent } from '../types';

export function getCachedOutlookEvents(): CalendarEvent[] {
  return [];
}

export function mergeOutlookEvents(
  localEvents: CalendarEvent[],
  outlookEvents: CalendarEvent[],
): CalendarEvent[] {
  const localOnly = localEvents.filter((e) => e.source !== 'outlook');
  const deduped = new Map<string, CalendarEvent>();
  for (const e of outlookEvents) {
    deduped.set(e.outlookId || e.id, e);
  }
  return [...localOnly, ...deduped.values()];
}

export function saveOutlookEvents(events: CalendarEvent[]): void {
  void events;
}

export function clearOutlookData(): void {
  // No-op: Outlook event data now comes only from DB sync endpoints.
}

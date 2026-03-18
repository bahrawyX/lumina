import type { CalendarEvent } from '../types';

const SYNC_STORAGE_KEY = 'lumina_outlook_events';

function loadCachedOutlookEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCachedOutlookEvents(events: CalendarEvent[]): void {
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(events));
}

export function getCachedOutlookEvents(): CalendarEvent[] {
  return loadCachedOutlookEvents();
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
  saveCachedOutlookEvents(events);
}

export function clearOutlookData(): void {
  localStorage.removeItem(SYNC_STORAGE_KEY);
}

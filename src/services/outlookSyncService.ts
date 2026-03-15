import { acquireToken, isOutlookConnected } from '../lib/outlook/outlookAuth';
import { fetchOutlookEvents, mapOutlookEventToLuminaEvent } from '../lib/outlook/outlookEvents';
import type { CalendarEvent } from '../types';

const SYNC_STORAGE_KEY = 'lumina_outlook_events';

let isSyncing = false;

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

export async function syncOutlookCalendar(
  timezone: string,
): Promise<CalendarEvent[]> {
  if (!isOutlookConnected()) return loadCachedOutlookEvents();
  if (isSyncing) return loadCachedOutlookEvents();

  isSyncing = true;
  try {
    const token = await acquireToken();
    const rawEvents = await fetchOutlookEvents(token);
    const mapped = rawEvents.map((e) => mapOutlookEventToLuminaEvent(e, timezone));
    saveCachedOutlookEvents(mapped);
    return mapped;
  } catch (err) {
    console.error('[Outlook Sync]', err);
    return loadCachedOutlookEvents();
  } finally {
    isSyncing = false;
  }
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

export function clearOutlookData(): void {
  localStorage.removeItem(SYNC_STORAGE_KEY);
}

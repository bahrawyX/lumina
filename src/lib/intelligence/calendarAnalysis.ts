import type { IntelligenceCalendarEvent } from './types';

export interface TimeInterval {
  startMs: number;
  endMs: number;
}

export interface DayWindow {
  dayKey: string;
  startMs: number;
  endMs: number;
}

function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const [yearStr, monthStr, dayStr] = dayKey.split('-');
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}

export function toZonedUtc(dayKey: string, hour: number, minute: number, timezone: string): Date {
  const { year, month, day } = parseDayKey(dayKey);
  const utcCandidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const localInZone = new Date(utcCandidate.toLocaleString('en-US', { timeZone: timezone }));
  const diffMs = utcCandidate.getTime() - localInZone.getTime();
  return new Date(utcCandidate.getTime() + diffMs);
}

export function getDateKeyInTimezone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function listDateKeysInRange(startIso: string, endIso: string, timezone: string): string[] {
  const keys: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);

  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const key = getDateKeyInTimezone(cursor.toISOString(), timezone);
    if (keys.length === 0 || keys[keys.length - 1] !== key) keys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

export function createWorkingDayWindows(
  startIso: string,
  endIso: string,
  timezone: string,
  workdayStartHour = 8,
  workdayEndHour = 18,
): DayWindow[] {
  return listDateKeysInRange(startIso, endIso, timezone).map((dayKey) => {
    const start = toZonedUtc(dayKey, workdayStartHour, 0, timezone);
    const end = toZonedUtc(dayKey, workdayEndHour, 0, timezone);
    return {
      dayKey,
      startMs: start.getTime(),
      endMs: end.getTime(),
    };
  });
}

export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: TimeInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

export function subtractIntervals(base: TimeInterval, busy: TimeInterval[]): TimeInterval[] {
  if (busy.length === 0) return [base];

  const result: TimeInterval[] = [];
  let cursor = base.startMs;

  for (const slot of busy) {
    const overlapStart = Math.max(cursor, slot.startMs);
    const overlapEnd = Math.min(base.endMs, slot.endMs);

    if (overlapStart > cursor) {
      result.push({ startMs: cursor, endMs: overlapStart });
    }

    if (overlapEnd > cursor) {
      cursor = overlapEnd;
    }
  }

  if (cursor < base.endMs) {
    result.push({ startMs: cursor, endMs: base.endMs });
  }

  return result;
}

export function eventDurationMinutes(event: IntelligenceCalendarEvent): number {
  return Math.max(0, Math.round((new Date(event.endIso).getTime() - new Date(event.startIso).getTime()) / 60000));
}

export function dedupeCalendarEvents(events: IntelligenceCalendarEvent[]): IntelligenceCalendarEvent[] {
  const seen = new Set<string>();
  const deduped: IntelligenceCalendarEvent[] = [];

  for (const event of events) {
    const exactKey = `${event.title.toLowerCase()}|${event.startIso}|${event.endIso}`;
    const fallbackKey = `${event.title.toLowerCase()}|${event.startIso}`;

    if (seen.has(exactKey) || seen.has(fallbackKey)) continue;
    seen.add(exactKey);
    seen.add(fallbackKey);
    deduped.push(event);
  }

  return deduped;
}

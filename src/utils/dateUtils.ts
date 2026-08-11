
import { CalendarEvent, OverlapGroup, EventInstance } from '../types';

export const HOUR_HEIGHT = 80;

import { timeToMinutes, minutesToTime } from './time/timeUtils';
export { timeToMinutes, minutesToTime };

export const formatDateISO = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

export const getDaysInMonth = (year: number, month: number): Date[] => {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) =>
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
  );
};

export const getDaysInWeek = (currentDate: Date): Date[] => {
  const date = new Date(currentDate);
  const day = date.getDay();
  const diff = date.getDate() - day;
  const startOfWeek = new Date(date.setDate(diff));
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d);
  }
  return days;
};

const MIN_EVENT_HEIGHT_PX = 28;

export const getEventPosition = (startTime: string, endTime: string) => {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const duration = Math.max(endMins - startMins, 0);
  const top = (startMins / 60) * HOUR_HEIGHT;
  const height = Math.max((duration / 60) * HOUR_HEIGHT, MIN_EVENT_HEIGHT_PX);
  return { top, height };
};

/** Shift a YYYY-MM-DD string by N days. UTC math — immune to DST shifts. */
const addDaysISO = (iso: string, days: number): string => {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
};

/** Safety cap so a corrupt endDate can't spin out millions of instances. */
const MAX_SPAN_DAYS = 366;

/** Whole days an event covers beyond its start day (0 = single-day). */
const spanDays = (event: CalendarEvent): number => {
  if (!event.endDate || event.endDate <= event.date) return 0;
  const start = Date.parse(`${event.date}T00:00:00Z`);
  const end = Date.parse(`${event.endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.min(Math.round((end - start) / 86_400_000), MAX_SPAN_DAYS);
};

/**
 * Emit one instance per day an occurrence covers, clipping the times to each
 * day (first day: start→23:59, middle days: 00:00→23:59, last: 00:00→end).
 *
 * Views filter on `instanceDate`, so producing per-day instances here is what
 * makes multi-day events render everywhere without touching the view layer.
 */
const pushOccurrence = (
  out: EventInstance[],
  event: CalendarEvent,
  occurrenceDate: string,
  startISO: string,
  endISO: string,
  isExcluded: (date: string) => boolean | undefined,
): void => {
  // Exceptions are keyed to the occurrence's start day, so an excluded
  // occurrence drops entirely — not just its first day.
  if (isExcluded(occurrenceDate)) return;

  const span = spanDays(event);
  const occurrenceEnd = span === 0 ? occurrenceDate : addDaysISO(occurrenceDate, span);
  // Intersect the occurrence's full extent with the visible window, so an
  // event that began before the window but runs into it still shows up.
  if (occurrenceEnd < startISO || occurrenceDate > endISO) return;

  for (let i = 0; i <= span; i++) {
    const dayISO = i === 0 ? occurrenceDate : addDaysISO(occurrenceDate, i);
    if (dayISO > endISO) break;
    if (dayISO < startISO) continue;

    const isFirst = i === 0;
    const isLast = i === span;
    out.push({
      ...event,
      instanceDate: dayISO,
      startTime: isFirst ? event.startTime : '00:00',
      endTime: isLast ? event.endTime : '23:59',
      spanIndex: i,
      spanTotal: span + 1,
      isSpanStart: isFirst,
      isSpanEnd: isLast,
    });
  }
};

/**
 * Optimized Recurrence Engine: Handles EXDATE (exceptions) and lazy expansion.
 */
export const expandRecurrences = (events: CalendarEvent[], startRange: Date, endRange: Date): EventInstance[] => {
  const instances: EventInstance[] = [];
  const startISO = formatDateISO(startRange);
  const endISO = formatDateISO(endRange);

  for (const event of events) {
    // If deleted from this specific instance date
    const isExcluded = (date: string) => event.exceptions?.includes(date);

    if (!event.recurrence) {
      pushOccurrence(instances, event, event.date, startISO, endISO, isExcluded);
      continue;
    }

    const { frequency, interval, daysOfWeek, endCondition } = event.recurrence;
    const safeInterval = Math.max(1, Math.floor(interval ?? 1)); // guard against 0 or NaN
    const current = new Date(event.date + 'T00:00:00');
    let count = 0;

    // Fast-forward to range if possible for optimization
    if (frequency === 'DAILY' && current < startRange) {
        const diffMs = startRange.getTime() - current.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const jump = Math.floor(diffDays / safeInterval) * safeInterval;
        current.setDate(current.getDate() + Math.max(0, jump - safeInterval));
    }

    while (true) {
      const currentISO = formatDateISO(current);
      
      // Stop conditions
      if (endCondition.type === 'UNTIL' && currentISO > endCondition.untilDate) break;
      if (endCondition.type === 'COUNT' && count >= endCondition.count) break;
      
      // Lazy range safety — all frequencies stop once we've passed the visible end.
      if (currentISO > endISO) break;

      let matches = false;
      if (frequency === 'DAILY') matches = true;
      if (frequency === 'WEEKLY') {
        matches = !daysOfWeek || daysOfWeek.includes(current.getDay());
      }
      if (frequency === 'MONTHLY') {
        const startDate = new Date(event.date + 'T00:00:00');
        matches = current.getDate() === startDate.getDate();
      }

      if (matches) {
        pushOccurrence(instances, event, currentISO, startISO, endISO, isExcluded);
        count++;
      }

      // Increment
      if (frequency === 'DAILY') current.setDate(current.getDate() + safeInterval);
      else if (frequency === 'WEEKLY') current.setDate(current.getDate() + 1);
      else if (frequency === 'MONTHLY') {
        // Advance whole months WITHOUT drifting off the anchor day. A naive
        // `setMonth(getMonth()+1)` on a day-31 event overflows short months
        // (Jan 31 → early March) and getDate() never returns to 31 again, so
        // the series silently dies after the first month (the M bug). Instead we
        // re-anchor to the ORIGINAL day-of-month each step: set day=1 first to
        // avoid the overflow, then clamp to the target month's length. Months
        // too short to hold the anchor day land on a clamped date that fails the
        // getDate() === anchor guard above and are correctly skipped (matching
        // RFC 5545 MONTHLY / Google Calendar "monthly on the 31st" semantics).
        const anchorDay = new Date(event.date + 'T00:00:00').getDate();
        current.setDate(1);
        current.setMonth(current.getMonth() + safeInterval);
        const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        current.setDate(Math.min(anchorDay, daysInMonth));
      }
      
      if (count > 2000 || currentISO > '2099-12-31') break; // Hard safety
    }
  }
  return instances;
};

export const calculateOverlaps = (dayEvents: EventInstance[]): Map<string, OverlapGroup> => {
  const sorted = [...dayEvents].sort((a, b) => {
    const startA = timeToMinutes(a.startTime);
    const startB = timeToMinutes(b.startTime);
    return startA !== startB ? startA - startB : timeToMinutes(a.endTime) - timeToMinutes(b.endTime);
  });

  const results = new Map<string, OverlapGroup>();
  if (sorted.length === 0) return results;

  const clusters: EventInstance[][] = [];
  let currentCluster: EventInstance[] = [];
  let clusterEnd = -1;

  for (const event of sorted) {
    const start = timeToMinutes(event.startTime);
    const end = timeToMinutes(event.endTime);
    if (start >= clusterEnd) {
      if (currentCluster.length > 0) clusters.push(currentCluster);
      currentCluster = [event];
      clusterEnd = end;
    } else {
      currentCluster.push(event);
      clusterEnd = Math.max(clusterEnd, end);
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  for (const cluster of clusters) {
    const columns: number[] = [];
    for (const event of cluster) {
      const start = timeToMinutes(event.startTime);
      let placed = false;
      for (let i = 0; i < columns.length; i++) {
        if (start >= columns[i]) {
          columns[i] = timeToMinutes(event.endTime);
          results.set(event.id, {
            column: i,
            totalColumns: 0,
            hasConflict: cluster.length > 1,
            overlapCount: cluster.length,
          });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push(timeToMinutes(event.endTime));
        results.set(event.id, {
          column: columns.length - 1,
          totalColumns: 0,
          hasConflict: cluster.length > 1,
          overlapCount: cluster.length,
        });
      }
    }
    const totalColumns = columns.length;
    for (const event of cluster) {
      const existing = results.get(event.id);
      if (existing) {
        results.set(event.id, { ...existing, totalColumns, overlapCount: totalColumns });
      }
    }
  }
  return results;
};

export const formatTime = (time: string): string => {
  if (!time) return '';
  const [hour, min] = time.split(':').map(Number);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${min.toString().padStart(2, '0')} ${ampm}`;
};


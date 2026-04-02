import {
  createWorkingDayWindows,
  mergeIntervals,
  subtractIntervals,
  type TimeInterval,
} from './calendarAnalysis';
import { scoreFocusWindow } from './scoring';
import type { FocusWindow, IntelligenceCalendarEvent, IntelligencePlannedItem } from './types';

export function detectFocusWindows(args: {
  events: IntelligenceCalendarEvent[];
  rangeStartIso: string;
  rangeEndIso: string;
  timezone: string;
  minFocusWindowMinutes: number;
  workdayStartHour?: number;
  workdayEndHour?: number;
  plannedItems?: IntelligencePlannedItem[];
}): FocusWindow[] {
  const windows = createWorkingDayWindows(
    args.rangeStartIso,
    args.rangeEndIso,
    args.timezone,
    args.workdayStartHour ?? 8,
    args.workdayEndHour ?? 18,
  );

  const focusWindows: FocusWindow[] = [];

  for (const dayWindow of windows) {
    const eventBusy: TimeInterval[] = args.events
      .filter((event) => !event.isAllDay)
      .map((event) => ({
        startMs: new Date(event.startIso).getTime(),
        endMs: new Date(event.endIso).getTime(),
      }));

    const plannedBusy: TimeInterval[] = (args.plannedItems ?? []).map((item) => ({
      startMs: new Date(item.startIso).getTime(),
      endMs: new Date(item.endIso).getTime(),
    }));

    const busy: TimeInterval[] = [...eventBusy, ...plannedBusy]
      .filter((slot) => slot.endMs > dayWindow.startMs && slot.startMs < dayWindow.endMs)
      .map((slot) => ({
        startMs: Math.max(slot.startMs, dayWindow.startMs),
        endMs: Math.min(slot.endMs, dayWindow.endMs),
      }));

    const mergedBusy = mergeIntervals(busy);
    const freeSlots = subtractIntervals(
      { startMs: dayWindow.startMs, endMs: dayWindow.endMs },
      mergedBusy,
    );

    for (const slot of freeSlots) {
      const durationMinutes = Math.round((slot.endMs - slot.startMs) / 60000);
      if (durationMinutes < args.minFocusWindowMinutes) continue;

      const startIso = new Date(slot.startMs).toISOString();
      const endIso = new Date(slot.endMs).toISOString();
      const score = scoreFocusWindow(startIso, durationMinutes, args.timezone);
      const reason = `No meetings, ${durationMinutes}m uninterrupted focus time`;

      focusWindows.push({
        start: startIso,
        end: endIso,
        durationMinutes,
        score,
        reason,
      });
    }
  }

  return focusWindows.sort((a, b) => b.score - a.score || b.durationMinutes - a.durationMinutes);
}

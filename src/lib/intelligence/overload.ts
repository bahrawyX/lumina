import { createWorkingDayWindows, getDateKeyInTimezone } from './calendarAnalysis';
import { getUrgentTaskMinutesForDate, scoreOverload } from './scoring';
import type { FocusWindow, IntelligenceCalendarEvent, IntelligenceTask, Overload } from './types';

function severityFromScore(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

export function detectOverloads(args: {
  events: IntelligenceCalendarEvent[];
  tasks: IntelligenceTask[];
  focusWindows: FocusWindow[];
  timezone: string;
  rangeStartIso: string;
  rangeEndIso: string;
}): Overload[] {
  const overloads: Overload[] = [];
  const dayWindows = createWorkingDayWindows(args.rangeStartIso, args.rangeEndIso, args.timezone, 8, 18);

  for (const dayWindow of dayWindows) {
    const dayEvents = args.events
      .filter((event) => !event.isAllDay)
      .filter((event) => getDateKeyInTimezone(event.startIso, args.timezone) === dayWindow.dayKey)
      .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());

    const meetingMinutes = dayEvents.reduce((sum, event) => {
      const startMs = new Date(event.startIso).getTime();
      const endMs = new Date(event.endIso).getTime();
      return sum + Math.max(0, Math.round((endMs - startMs) / 60000));
    }, 0);

    let backToBackCount = 0;
    for (let i = 0; i < dayEvents.length - 1; i += 1) {
      const gapMs = new Date(dayEvents[i + 1].startIso).getTime() - new Date(dayEvents[i].endIso).getTime();
      if (gapMs >= 0 && gapMs <= 10 * 60 * 1000) backToBackCount += 1;
    }

    const focusMinutes = args.focusWindows
      .filter((window) => getDateKeyInTimezone(window.start, args.timezone) === dayWindow.dayKey)
      .reduce((sum, window) => sum + window.durationMinutes, 0);

    const urgentTaskMinutes = getUrgentTaskMinutesForDate(dayWindow.dayKey, args.timezone, args.tasks);

    const score = scoreOverload({
      meetingMinutes,
      focusMinutes,
      urgentTaskMinutes,
      backToBackCount,
    });

    if (score < 0.45) continue;

    overloads.push({
      date: dayWindow.dayKey,
      severity: severityFromScore(score),
      reason: `${meetingMinutes}m meetings, ${focusMinutes}m focus time, ${urgentTaskMinutes}m urgent task pressure`,
      score,
      meetingMinutes,
      focusMinutes,
      urgentTaskMinutes,
    });
  }

  return overloads.sort((a, b) => b.score - a.score);
}

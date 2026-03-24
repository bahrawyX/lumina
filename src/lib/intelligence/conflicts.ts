import { createWorkingDayWindows, getDateKeyInTimezone } from './calendarAnalysis';
import type { Conflict, FocusWindow, IntelligenceCalendarEvent, IntelligenceTask } from './types';

function toSeverity(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.75) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export function detectConflicts(args: {
  events: IntelligenceCalendarEvent[];
  tasks: IntelligenceTask[];
  focusWindows: FocusWindow[];
  timezone: string;
  rangeStartIso: string;
  rangeEndIso: string;
}): Conflict[] {
  const conflicts: Conflict[] = [];

  const timedEvents = args.events
    .filter((e) => !e.isAllDay)
    .slice()
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());

  for (let i = 0; i < timedEvents.length - 1; i += 1) {
    const current = timedEvents[i];
    const next = timedEvents[i + 1];

    const currentEnd = new Date(current.endIso).getTime();
    const nextStart = new Date(next.startIso).getTime();
    if (nextStart >= currentEnd) continue;

    conflicts.push({
      type: 'overlap',
      severity: 'high',
      start: next.startIso,
      end: new Date(Math.min(currentEnd, new Date(next.endIso).getTime())).toISOString(),
      relatedEventIds: [current.id, next.id],
      reason: 'Two events overlap in time.',
    });
  }

  const openTasks = args.tasks.filter((task) => task.status !== 'done' && task.status !== 'archived');
  for (const task of openTasks) {
    if (!task.dueDateIso) continue;

    const dueMs = new Date(task.dueDateIso).getTime();
    const viable = args.focusWindows.some((window) => {
      const windowStartMs = new Date(window.start).getTime();
      return windowStartMs <= dueMs && window.durationMinutes >= task.estimatedMinutes;
    });

    if (!viable) {
      conflicts.push({
        type: 'task_due_conflict',
        severity: task.priority === 'high' ? 'high' : 'medium',
        start: new Date(Math.min(dueMs, Date.now())).toISOString(),
        end: new Date(dueMs).toISOString(),
        relatedEventIds: [],
        relatedTaskIds: [task.id],
        reason: 'No available focus window fits this task before its due date.',
      });
    }
  }

  const windows = createWorkingDayWindows(args.rangeStartIso, args.rangeEndIso, args.timezone, 8, 18);
  for (const dayWindow of windows) {
    const dayMeetingMinutes = args.events
      .filter((event) => !event.isAllDay)
      .filter((event) => getDateKeyInTimezone(event.startIso, args.timezone) === dayWindow.dayKey)
      .reduce((sum, event) => {
        const startMs = new Date(event.startIso).getTime();
        const endMs = new Date(event.endIso).getTime();
        return sum + Math.max(0, Math.round((endMs - startMs) / 60000));
      }, 0);

    const dayUrgentTaskMinutes = openTasks
      .filter((task) => task.priority === 'high')
      .filter((task) => task.dueDateIso && getDateKeyInTimezone(task.dueDateIso, args.timezone) <= dayWindow.dayKey)
      .reduce((sum, task) => sum + task.estimatedMinutes, 0);

    const dayWorkMinutes = Math.round((dayWindow.endMs - dayWindow.startMs) / 60000);
    const loadRatio = (dayMeetingMinutes + dayUrgentTaskMinutes) / Math.max(dayWorkMinutes, 1);

    if (loadRatio > 1) {
      conflicts.push({
        type: 'impossible_day_load',
        severity: toSeverity(Math.min(loadRatio, 1)),
        start: new Date(dayWindow.startMs).toISOString(),
        end: new Date(dayWindow.endMs).toISOString(),
        relatedEventIds: [],
        reason: 'Scheduled commitments plus urgent tasks exceed practical day capacity.',
      });
    }
  }

  return conflicts;
}

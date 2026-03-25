import { getDateKeyInTimezone } from './calendarAnalysis';

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function scoreFocusWindow(
  startIso: string,
  durationMinutes: number,
  timezone: string,
): number {
  const start = new Date(startIso);
  const localHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(start),
  );

  const durationScore = clamp(durationMinutes / 180);
  const morningBonus = localHour >= 8 && localHour <= 11 ? 1 : localHour <= 14 ? 0.6 : 0.3;
  const longBlockBonus = durationMinutes >= 120 ? 1 : durationMinutes >= 90 ? 0.7 : 0.4;

  return clamp(durationScore * 0.55 + morningBonus * 0.25 + longBlockBonus * 0.2);
}

export function scoreTaskSuggestion(args: {
  dueDateIso: string | null;
  suggestedStartIso: string;
  durationMinutes: number;
  estimatedMinutes: number;
  windowScore: number;
}): number {
  const fitScore = clamp(args.durationMinutes / Math.max(args.estimatedMinutes, 1));

  let urgencyScore = 0.4;
  if (args.dueDateIso) {
    const dueMs = new Date(args.dueDateIso).getTime();
    const startMs = new Date(args.suggestedStartIso).getTime();
    const days = (dueMs - startMs) / 86_400_000;
    if (days <= 0) urgencyScore = 1;
    else if (days <= 1) urgencyScore = 0.9;
    else if (days <= 3) urgencyScore = 0.75;
    else if (days <= 7) urgencyScore = 0.6;
    else urgencyScore = 0.35;
  }

  return clamp(fitScore * 0.45 + urgencyScore * 0.35 + args.windowScore * 0.2);
}

export function scoreOverload(args: {
  meetingMinutes: number;
  focusMinutes: number;
  urgentTaskMinutes: number;
  backToBackCount: number;
}): number {
  // Explainable weighted model:
  // - meeting load (40%): proportion of a standard 8h day occupied by meetings
  // - focus deficit (25%): missing target of 2h focus block
  // - urgent pressure (25%): urgent-task minutes relative to 4h capacity
  // - fragmentation (10%): back-to-back meetings without recovery
  const meetingLoad = clamp(args.meetingMinutes / 480);
  const focusDeficit = clamp((120 - args.focusMinutes) / 120);
  const urgentPressure = clamp(args.urgentTaskMinutes / 240);
  const fragmentation = clamp(args.backToBackCount / 6);

  return clamp(
    meetingLoad * 0.4 + focusDeficit * 0.25 + urgentPressure * 0.25 + fragmentation * 0.1,
  );
}

export function getUrgentTaskMinutesForDate(
  dateKey: string,
  timezone: string,
  tasks: Array<{ dueDateIso: string | null; estimatedMinutes: number; status: string }>,
): number {
  return tasks
    .filter((task) => task.status !== 'done')
    .filter((task) => {
      if (!task.dueDateIso) return false;
      return getDateKeyInTimezone(task.dueDateIso, timezone) <= dateKey;
    })
    .reduce((sum, task) => sum + Math.max(0, task.estimatedMinutes), 0);
}

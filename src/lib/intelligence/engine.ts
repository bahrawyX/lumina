import { dedupeCalendarEvents, eventDurationMinutes } from './calendarAnalysis';
import { detectConflicts } from './conflicts';
import { detectFocusWindows } from './focusWindows';
import { detectOverloads } from './overload';
import { buildRecommendations } from './recommendations';
import { suggestTaskTimeSlots } from './taskMatching';
import type {
  IntelligenceInput,
  IntelligenceMetrics,
  IntelligenceOutput,
  IntelligenceProvider,
} from './types';

function countByProvider(provider: IntelligenceProvider, providerCounts: Record<IntelligenceProvider, number>): number {
  return providerCounts[provider] ?? 0;
}

export function runIntelligenceEngine(input: IntelligenceInput): IntelligenceOutput {
  const dedupedEvents = dedupeCalendarEvents(input.calendarEvents);

  const focusWindows = detectFocusWindows({
    events: dedupedEvents,
    rangeStartIso: input.rangeStartIso,
    rangeEndIso: input.rangeEndIso,
    timezone: input.timezone,
    minFocusWindowMinutes: input.minFocusWindowMinutes,
  });

  const conflicts = detectConflicts({
    events: dedupedEvents,
    tasks: input.tasks,
    focusWindows,
    timezone: input.timezone,
    rangeStartIso: input.rangeStartIso,
    rangeEndIso: input.rangeEndIso,
  });

  const overloads = detectOverloads({
    events: dedupedEvents,
    tasks: input.tasks,
    focusWindows,
    timezone: input.timezone,
    rangeStartIso: input.rangeStartIso,
    rangeEndIso: input.rangeEndIso,
  });

  const taskSuggestions = suggestTaskTimeSlots({
    tasks: input.tasks,
    focusWindows,
  });

  const recommendations = buildRecommendations({
    focusWindows,
    conflicts,
    overloads,
    taskSuggestions,
  });

  const providerCounts = dedupedEvents.reduce(
    (acc, event) => {
      acc[event.provider] += 1;
      return acc;
    },
    { local: 0, google: 0, microsoft: 0 } as Record<IntelligenceProvider, number>,
  );

  const meetingMinutes = dedupedEvents
    .filter((event) => !event.isAllDay)
    .reduce((sum, event) => sum + eventDurationMinutes(event), 0);

  const metrics: IntelligenceMetrics = {
    totalEvents: dedupedEvents.length,
    localEvents: countByProvider('local', providerCounts),
    googleEvents: countByProvider('google', providerCounts),
    microsoftEvents: countByProvider('microsoft', providerCounts),
    totalTasks: input.tasks.length,
    openTasks: input.tasks.filter((task) => task.status !== 'done' && task.status !== 'archived').length,
    focusSessionsCount: input.focusSessions.length,
    scheduledMinutes: meetingMinutes,
    meetingMinutes,
    totalFocusWindowMinutes: focusWindows.reduce((sum, window) => sum + window.durationMinutes, 0),
  };

  return {
    summary: {
      rangeStart: input.rangeStartIso,
      rangeEnd: input.rangeEndIso,
      timezone: input.timezone,
      topFocusWindow: focusWindows[0] ?? null,
      topRecommendation: recommendations[0] ?? null,
    },
    focusWindows,
    conflicts,
    overloads,
    recommendations,
    taskSuggestions,
    metrics,
  };
}

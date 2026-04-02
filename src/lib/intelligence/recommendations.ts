import type { Conflict, FocusWindow, IntelligencePlannedItem, Overload, Recommendation, TaskSuggestion } from './types';

function buildId(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}

export function buildRecommendations(args: {
  focusWindows: FocusWindow[];
  conflicts: Conflict[];
  overloads: Overload[];
  taskSuggestions: TaskSuggestion[];
  plannedItems?: IntelligencePlannedItem[];
}): Recommendation[] {
  const recommendations: Recommendation[] = [];

  const topFocus = args.focusWindows[0];
  if (topFocus) {
    recommendations.push({
      id: buildId('focus', topFocus.start),
      type: 'focus_window',
      priority: 'high',
      explanation: `Best focus window starts at ${topFocus.start} with ${topFocus.durationMinutes} uninterrupted minutes.`,
      evidence: {
        durationMinutes: topFocus.durationMinutes,
        score: topFocus.score,
      },
    });
  }

  for (const overload of args.overloads.slice(0, 3)) {
    recommendations.push({
      id: buildId('overload', overload.date),
      type: 'overload',
      priority: overload.severity,
      explanation: `Day ${overload.date} is overloaded: ${overload.reason}`,
      evidence: {
        score: overload.score,
        meetingMinutes: overload.meetingMinutes,
        focusMinutes: overload.focusMinutes,
        urgentTaskMinutes: overload.urgentTaskMinutes,
      },
    });
  }

  for (const conflict of args.conflicts.slice(0, 3)) {
    recommendations.push({
      id: buildId('conflict', `${conflict.type}-${conflict.start}`),
      type: 'conflict',
      priority: conflict.severity,
      explanation: conflict.reason,
      evidence: {
        type: conflict.type,
        start: conflict.start,
        end: conflict.end,
      },
      relatedIds: [...conflict.relatedEventIds, ...(conflict.relatedTaskIds ?? [])],
    });
  }

  const plannedTaskIds = new Set((args.plannedItems ?? []).map((item) => item.taskId));

  for (const suggestion of args.taskSuggestions.slice(0, 5)) {
    if (plannedTaskIds.has(suggestion.taskId)) continue;
    recommendations.push({
      id: buildId('task', suggestion.taskId),
      type: 'task_plan',
      priority: suggestion.confidence >= 0.75 ? 'high' : suggestion.confidence >= 0.5 ? 'medium' : 'low',
      explanation: `Plan task ${suggestion.taskId} between ${suggestion.suggestedStart} and ${suggestion.suggestedEnd}.`,
      evidence: {
        confidence: suggestion.confidence,
        reason: suggestion.reason,
      },
      relatedIds: [suggestion.taskId],
    });
  }

  return recommendations;
}

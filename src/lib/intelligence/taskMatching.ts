import { scoreTaskSuggestion } from './scoring';
import type { FocusWindow, IntelligenceTask, TaskSuggestion } from './types';

function priorityWeight(priority: IntelligenceTask['priority']): number {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

export function suggestTaskTimeSlots(args: {
  tasks: IntelligenceTask[];
  focusWindows: FocusWindow[];
}): TaskSuggestion[] {
  const openTasks = args.tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => {
      const priorityDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      const aDue = a.dueDateIso ? new Date(a.dueDateIso).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDateIso ? new Date(b.dueDateIso).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });

  const suggestions: TaskSuggestion[] = [];

  for (const task of openTasks) {
    const candidates = args.focusWindows.filter((window) => {
      if (window.durationMinutes < task.estimatedMinutes) return false;
      if (!task.dueDateIso) return true;
      return new Date(window.start).getTime() <= new Date(task.dueDateIso).getTime();
    });

    if (candidates.length === 0) continue;

    const scoredCandidates = candidates.map((window) => ({
      window,
      confidence: scoreTaskSuggestion({
        dueDateIso: task.dueDateIso,
        suggestedStartIso: window.start,
        durationMinutes: window.durationMinutes,
        estimatedMinutes: task.estimatedMinutes,
        windowScore: window.score,
      }),
    }));

    scoredCandidates.sort((a, b) => b.confidence - a.confidence);
    const best = scoredCandidates[0];

    const suggestedStartMs = new Date(best.window.start).getTime();
    const suggestedEndMs = suggestedStartMs + task.estimatedMinutes * 60_000;

    suggestions.push({
      taskId: task.id,
      suggestedStart: new Date(suggestedStartMs).toISOString(),
      suggestedEnd: new Date(suggestedEndMs).toISOString(),
      confidence: best.confidence,
      reason: `Fits ${task.estimatedMinutes}m requirement in a ${best.window.durationMinutes}m focus window.`,
    });
  }

  return suggestions;
}

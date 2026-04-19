import { DailyContributionInputs } from '../../types/performance';

const CONTRIBUTION_WEIGHTS = {
  completedTasks: 1,
  focusSessions: 2,
  // Scheduled (any) calendar event = 1 pt — shows that the day was active
  scheduledEvents: 1,
  // An event explicitly marked complete is a bonus point
  completedEvents: 1,
  completedPlannerItems: 1,
} as const;

export function computeContributionScoreForDay(input: DailyContributionInputs): number {
  return (
    input.completedTasks * CONTRIBUTION_WEIGHTS.completedTasks +
    input.focusSessions * CONTRIBUTION_WEIGHTS.focusSessions +
    (input.scheduledEvents ?? 0) * CONTRIBUTION_WEIGHTS.scheduledEvents +
    input.completedEvents * CONTRIBUTION_WEIGHTS.completedEvents +
    input.completedPlannerItems * CONTRIBUTION_WEIGHTS.completedPlannerItems
  );
}

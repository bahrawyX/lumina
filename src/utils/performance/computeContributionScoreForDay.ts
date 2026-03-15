import { DailyContributionInputs } from '../../types/performance';

const CONTRIBUTION_WEIGHTS = {
  completedTasks: 1,
  focusSessions: 2,
  completedEvents: 1,
  completedPlannerItems: 1,
} as const;

export function computeContributionScoreForDay(input: DailyContributionInputs): number {
  return (
    input.completedTasks * CONTRIBUTION_WEIGHTS.completedTasks +
    input.focusSessions * CONTRIBUTION_WEIGHTS.focusSessions +
    input.completedEvents * CONTRIBUTION_WEIGHTS.completedEvents +
    input.completedPlannerItems * CONTRIBUTION_WEIGHTS.completedPlannerItems
  );
}
